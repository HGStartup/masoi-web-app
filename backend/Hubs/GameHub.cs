using Microsoft.AspNetCore.SignalR;
using MaSoiBackend.Models;
using MaSoiBackend.Services;

namespace MaSoiBackend.Hubs;

public class GameHub : Hub
{
    private readonly RoomManager _rooms;
    private readonly GameEngine _engine;
    private readonly VoteTimerService _voteTimer;

    public GameHub(RoomManager rooms, GameEngine engine, VoteTimerService voteTimer)
    {
        _rooms = rooms;
        _engine = engine;
        _voteTimer = voteTimer;
    }

    // === Room Management ===

    public async Task CreateRoom(bool isPublic = true)
    {
        var room = _rooms.CreateRoom(Context.ConnectionId, isPublic);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        await Clients.Caller.SendAsync("RoomCreated", room.Code);
        await SendHostState(room);
    }

    public async Task JoinRoom(string roomCode, string playerName)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null)
        {
            await Clients.Caller.SendAsync("Error", "Phòng không tồn tại.");
            return;
        }
        if (room.Phase != GamePhase.Lobby)
        {
            await Clients.Caller.SendAsync("Error", "Ván đã bắt đầu, không thể tham gia.");
            return;
        }

        var player = _rooms.AddPlayer(roomCode, playerName, Context.ConnectionId);
        if (player == null) return;

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await Clients.Caller.SendAsync("JoinedRoom", roomCode, player.Id);
        await SendHostState(room);
        await BroadcastRoomState(room);
    }

    public async Task AddGuestPlayer(string roomCode, string playerName)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;
        if (room.Phase != GamePhase.Lobby)
        {
            await Clients.Caller.SendAsync("Error", "Ván đã bắt đầu, không thể thêm người.");
            return;
        }
        if (string.IsNullOrWhiteSpace(playerName))
        {
            await Clients.Caller.SendAsync("Error", "Tên không được để trống.");
            return;
        }

        var player = _rooms.AddPlayer(roomCode, playerName.Trim(), null!);
        if (player == null) return;

        await SendHostState(room);
        await BroadcastRoomState(room);
    }

    public async Task ConfigureRoom(string roomCode, int playerCount, Dictionary<string, int> roles)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        var error = _engine.ValidateRoleConfig(roles, playerCount);
        if (error != null)
        {
            await Clients.Caller.SendAsync("Error", error);
            return;
        }

        room.Config = new GameConfig { PlayerCount = playerCount, Roles = roles };
        room.LastActivity = DateTime.UtcNow;
        Save(room);
        await SendHostState(room);
    }

    public async Task StartGame(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        if (room.Players.Count != room.Config.PlayerCount)
        {
            await Clients.Caller.SendAsync("Error",
                $"Cần {room.Config.PlayerCount} người chơi, hiện có {room.Players.Count}.");
            return;
        }

        var configError = _engine.ValidateRoleConfig(room.Config.Roles, room.Config.PlayerCount);
        if (configError != null)
        {
            await Clients.Caller.SendAsync("Error", configError);
            return;
        }

        // Assign roles
        _engine.AssignRoles(room.Players, room.Config.Roles);

        // Send role to each player privately
        foreach (var player in room.Players.Values)
        {
            if (player.ConnectionId != null)
            {
                await Clients.Client(player.ConnectionId).SendAsync("RoleAssigned",
                    player.Role.ToString()!.ToLower());
            }
        }

        // Initialize Elder lives (2 lives each)
        room.ElderLives = new Dictionary<string, int>();
        foreach (var p in room.Players.Values.Where(p => p.Role == Role.Elder))
            room.ElderLives[p.Id] = 2;

        // Start night phase
        room.Round = 1;
        room.Phase = GamePhase.Night;
        room.NightStepOrder = _engine.GetNightOrder(room.Config.Roles);
        room.NightStepIndex = 0;
        room.NightActions = new NightActions();
        room.LastActivity = DateTime.UtcNow;
        Save(room);

        await SendHostState(room);
        await SendNightStep(room);
        await BroadcastRoomState(room);
    }

    // === Night Phase ===

    public async Task SubmitNightAction(string roomCode, string step, string? targetId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room) || room.Phase != GamePhase.Night) return;

        switch (step.ToLower())
        {
            case "wolf":
                // Wolves can't kill other wolves (including alpha)
                if (targetId != null && room.Players.TryGetValue(targetId, out var wolfTarget))
                {
                    if (GameEngine.IsWolfTeam(wolfTarget.Role))
                    {
                        await Clients.Caller.SendAsync("Error", "Sói không thể cắn sói!");
                        return;
                    }
                }
                room.NightActions.WolfVictim = targetId;
                break;
            case "alphawolf":
                // Alpha wolf can convert once per game (or skip)
                if (targetId != null)
                {
                    if (room.NightActions.AlphaWolfConvertUsed)
                    {
                        await Clients.Caller.SendAsync("Error", "Sói Đầu Đàn đã dùng năng lực biến hình!");
                        return;
                    }
                    if (room.Players.TryGetValue(targetId, out var alphaTarget) && GameEngine.IsWolfTeam(alphaTarget.Role))
                    {
                        await Clients.Caller.SendAsync("Error", "Không thể biến sói thành sói!");
                        return;
                    }
                    room.NightActions.AlphaWolfConvert = targetId;
                }
                else
                {
                    room.NightActions.AlphaWolfConvert = null;
                }
                break;
            case "seer":
                room.NightActions.SeerTarget = targetId;
                if (targetId != null && room.Players.TryGetValue(targetId, out var target))
                    room.NightActions.SeerResult = GameEngine.IsWolfTeam(target.Role) ? "wolf" : "not-wolf";
                break;
            case "guard":
                // Guard can't protect same person 2 nights in a row
                if (targetId != null && targetId == room.NightActions.LastGuardProtect)
                {
                    await Clients.Caller.SendAsync("Error", "Bảo vệ không thể bảo vệ cùng 1 người 2 đêm liên tiếp!");
                    return;
                }
                room.NightActions.GuardProtect = targetId;
                break;
            case "doctor":
                // Doctor can't protect same person 2 nights in a row
                if (targetId != null && targetId == room.NightActions.LastDoctorSave)
                {
                    await Clients.Caller.SendAsync("Error", "Thầy thuốc không thể cứu cùng 1 người 2 đêm liên tiếp!");
                    return;
                }
                room.NightActions.DoctorSave = targetId;
                break;
            case "witch":
                if (targetId != null && targetId.StartsWith("heal:"))
                {
                    var healTargetId = targetId[5..];
                    var witchPlayer = room.Players.Values.FirstOrDefault(p => p.Role == Role.Witch);
                    if (witchPlayer != null && healTargetId == witchPlayer.Id)
                    {
                        await Clients.Caller.SendAsync("Error", "Phù thủy không thể tự cứu mình!");
                        return;
                    }
                    if (room.NightActions.WitchHealUsed)
                    {
                        await Clients.Caller.SendAsync("Error", "Phù thủy đã dùng hết thuốc cứu!");
                        return;
                    }
                    room.NightActions.WitchHeal = healTargetId;
                }
                else if (targetId != null && targetId.StartsWith("poison:"))
                {
                    if (room.NightActions.WitchPoisonUsed)
                    {
                        await Clients.Caller.SendAsync("Error", "Phù thủy đã dùng hết thuốc độc!");
                        return;
                    }
                    room.NightActions.WitchPoison = targetId[7..];
                }
                break;
            case "hunter":
                break;
        }

        room.LastActivity = DateTime.UtcNow;
        Save(room);
        await SendHostState(room);
    }

    public async Task AdvanceNight(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room) || room.Phase != GamePhase.Night) return;

        // Validate current step has been completed
        var currentRole = room.NightStepOrder[room.NightStepIndex];
        var validationError = ValidateNightStepCompleted(room, currentRole);
        if (validationError != null)
        {
            await Clients.Caller.SendAsync("Error", validationError);
            return;
        }

        room.NightStepIndex++;
        room.LastActivity = DateTime.UtcNow;

        if (room.NightStepIndex >= room.NightStepOrder.Count)
        {
            await EndNight(roomCode);
        }
        else
        {
            Save(room);
            await SendNightStep(room);
            await SendHostState(room);
        }
    }

    public async Task GoBackNight(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room) || room.Phase != GamePhase.Night) return;

        if (room.NightStepIndex > 0)
        {
            room.NightStepIndex--;
            room.LastActivity = DateTime.UtcNow;
            Save(room);
            await SendNightStep(room);
            await SendHostState(room);
        }
    }

    public async Task EndNight(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        // Validate all steps completed
        for (int i = 0; i < room.NightStepOrder.Count; i++)
        {
            var role = room.NightStepOrder[i];
            var error = ValidateNightStepCompleted(room, role);
            if (error != null)
            {
                await Clients.Caller.SendAsync("Error", $"Chưa hoàn thành: {error}");
                return;
            }
        }

        // Mark witch potions as used (only after successful night resolution)
        if (room.NightActions.WitchHeal != null)
            room.NightActions.WitchHealUsed = true;
        if (room.NightActions.WitchPoison != null)
            room.NightActions.WitchPoisonUsed = true;
        if (room.NightActions.AlphaWolfConvert != null)
            room.NightActions.AlphaWolfConvertUsed = true;

        var (deaths, announcements, converted) = _engine.ResolveNight(room.Players, room.NightActions, room.ElderLives);

        // Handle alpha wolf conversion
        if (converted != null && room.Players.TryGetValue(converted, out var convertedPlayer))
        {
            convertedPlayer.Role = Role.Wolf;
            // Notify converted player (if they have a connection)
            if (convertedPlayer.ConnectionId != null)
                await Clients.Client(convertedPlayer.ConnectionId).SendAsync("RoleAssigned", "wolf");
        }

        // Check for hunter death trigger
        foreach (var pid in deaths)
        {
            if (room.Players.TryGetValue(pid, out var p))
            {
                p.IsAlive = false;
                if (p.Role == Role.Hunter)
                {
                    room.HunterPendingShot = pid;
                }
            }
        }

        // Elder killed by village vote penalty: all villagers lose special powers
        // (This is checked in ConfirmExecute/AutoCloseVote, not here)

        room.PendingAnnouncements = announcements;
        room.Phase = GamePhase.Day;
        room.LastActivity = DateTime.UtcNow;

        var winner = _engine.CheckWinCondition(room.Players);
        if (winner != null)
        {
            room.Winner = winner;
            room.Phase = GamePhase.Ended;
            Save(room);
            await BroadcastGameEnded(room);
            return;
        }

        // If hunter died, notify host to handle hunter shot
        if (room.HunterPendingShot != null)
        {
            Save(room);
            await SendHostState(room);
            await BroadcastRoomState(room);
            var hunter = room.Players[room.HunterPendingShot];
            await Clients.Client(room.HostConnectionId).SendAsync("HunterShot",
                new PlayerDto(hunter.Id, hunter.Name, false, "hunter"));
            return;
        }

        Save(room);
        await SendHostState(room);
        await BroadcastRoomState(room);
    }

    // === Hunter Shot ===

    public async Task HunterShoot(string roomCode, string targetId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;
        if (room.HunterPendingShot == null) return;

        if (room.Players.TryGetValue(targetId, out var target) && target.IsAlive)
        {
            target.IsAlive = false;
            var hunter = room.Players[room.HunterPendingShot];
            room.PendingAnnouncements.Add($"Thợ săn {hunter.Name} đã bắn chết {target.Name} trước khi chết!");

            // If the shot target is also a hunter, they also get to shoot (chain)
            if (target.Role == Role.Hunter)
            {
                room.HunterPendingShot = target.Id;
                Save(room);
                await SendHostState(room);
                await BroadcastRoomState(room);
                await Clients.Client(room.HostConnectionId).SendAsync("HunterShot",
                    new PlayerDto(target.Id, target.Name, false, "hunter"));
                return;
            }
        }

        room.HunterPendingShot = null;
        room.LastActivity = DateTime.UtcNow;

        var winner = _engine.CheckWinCondition(room.Players);
        if (winner != null)
        {
            room.Winner = winner;
            room.Phase = GamePhase.Ended;
            Save(room);
            await BroadcastGameEnded(room);
            return;
        }

        Save(room);
        await SendHostState(room);
        await BroadcastRoomState(room);
    }

    // === Day Phase ===

    public async Task Announce(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        await Clients.Group(roomCode).SendAsync("DayAnnouncements", room.PendingAnnouncements);
        room.LastActivity = DateTime.UtcNow;
    }

    public async Task MarkDead(string roomCode, string playerId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        if (room.Players.TryGetValue(playerId, out var player))
        {
            player.IsAlive = false;
            room.LastActivity = DateTime.UtcNow;

            // Hunter death trigger
            if (player.Role == Role.Hunter)
            {
                room.HunterPendingShot = player.Id;
                Save(room);
                await SendHostState(room);
                await BroadcastRoomState(room);
                await Clients.Client(room.HostConnectionId).SendAsync("HunterShot",
                    new PlayerDto(player.Id, player.Name, false, "hunter"));
                return;
            }

            var winner = _engine.CheckWinCondition(room.Players);
            if (winner != null)
            {
                room.Winner = winner;
                room.Phase = GamePhase.Ended;
                Save(room);
                await BroadcastGameEnded(room);
                return;
            }

            Save(room);
            await SendHostState(room);
            await BroadcastRoomState(room);
        }
    }

    // === Voting ===

    public async Task OpenVote(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        var deadline = DateTime.UtcNow.AddSeconds(30);
        room.Phase = GamePhase.Voting;
        room.VoteSession = new VoteSession { IsOpen = true, Votes = new(), Deadline = deadline };
        room.LastActivity = DateTime.UtcNow;

        var candidates = room.Players.Values
            .Where(p => p.IsAlive)
            .Select(p => new PlayerDto(p.Id, p.Name, p.IsAlive))
            .ToList();

        Save(room);
        await Clients.Group(roomCode).SendAsync("VoteOpened", candidates, 30); // 30 seconds
        await SendHostState(room);
        await BroadcastRoomState(room);

        // Start vote timer
        _voteTimer.StartTimer(roomCode, 30);
    }

    public async Task CastVote(string roomCode, string targetId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !room.VoteSession.IsOpen) return;

        var voter = room.Players.Values.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
        if (voter == null || !voter.IsAlive) return;

        // Dead players can't be voted for
        if (room.Players.TryGetValue(targetId, out var target) && !target.IsAlive)
        {
            await Clients.Caller.SendAsync("Error", "Không thể vote cho người đã chết!");
            return;
        }

        room.VoteSession.Votes[voter.Id] = targetId;
        room.LastActivity = DateTime.UtcNow;
        Save(room);

        await BroadcastVoteCounts(room);
        await CheckAllVoted(room);
    }

    // Host votes on behalf of a guest player (no phone)
    public async Task CastVoteForGuest(string roomCode, string guestPlayerId, string targetId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room) || !room.VoteSession.IsOpen) return;

        if (!room.Players.TryGetValue(guestPlayerId, out var guest) || !guest.IsAlive) return;
        if (guest.ConnectionId != null)
        {
            await Clients.Caller.SendAsync("Error", "Người chơi này có điện thoại, tự vote được!");
            return;
        }

        if (room.Players.TryGetValue(targetId, out var target) && !target.IsAlive)
        {
            await Clients.Caller.SendAsync("Error", "Không thể vote cho người đã chết!");
            return;
        }

        room.VoteSession.Votes[guestPlayerId] = targetId;
        room.LastActivity = DateTime.UtcNow;
        Save(room);

        await BroadcastVoteCounts(room);
        await CheckAllVoted(room);
    }

    private async Task CheckAllVoted(GameRoom room)
    {
        var aliveCount = room.Players.Values.Count(p => p.IsAlive);
        if (room.VoteSession.Votes.Count >= aliveCount)
        {
            _voteTimer.CancelTimer(room.Code);
            await AutoCloseVote(room);
        }
    }

    public async Task AutoCloseVote(GameRoom room)
    {
        if (!room.VoteSession.IsOpen) return;

        // Auto-random for players who didn't vote
        var alivePlayers = room.Players.Values.Where(p => p.IsAlive).ToList();
        var aliveIds = alivePlayers.Select(p => p.Id).ToList();
        var rng = new Random();

        foreach (var player in alivePlayers)
        {
            if (!room.VoteSession.Votes.ContainsKey(player.Id))
            {
                // Random vote among alive players (excluding self)
                var candidates = aliveIds.Where(id => id != player.Id).ToList();
                if (candidates.Count > 0)
                {
                    room.VoteSession.Votes[player.Id] = candidates[rng.Next(candidates.Count)];
                }
            }
        }

        room.VoteSession.IsOpen = false;
        room.LastActivity = DateTime.UtcNow;
        Save(room);

        await BroadcastVoteCounts(room);
        await Clients.Group(room.Code).SendAsync("VoteClosed");

        // Auto-execute: person with most votes gets hanged
        var counts = GetVoteCounts(room);
        if (counts.Count > 0)
        {
            var maxVotes = counts.Values.Max();
            var topVoted = counts.Where(kv => kv.Value == maxVotes).Select(kv => kv.Key).ToList();
            var executedId = topVoted[rng.Next(topVoted.Count)];

            if (room.Players.TryGetValue(executedId, out var executed))
            {
                executed.IsAlive = false;

                await Clients.Group(room.Code).SendAsync("VoteExecuted",
                    new PlayerDto(executed.Id, executed.Name, false, executed.Role?.ToString()?.ToLower()));

                // Elder killed by village → all villagers lose special powers
                if (executed.Role == Role.Elder)
                {
                    ApplyElderPenalty(room);
                    room.PendingAnnouncements.Add("Già làng bị treo cổ! Toàn bộ dân làng mất năng lực đặc biệt.");
                }

                // Hunter death trigger
                if (executed.Role == Role.Hunter)
                {
                    room.HunterPendingShot = executed.Id;
                    room.VoteSession = new VoteSession();
                    Save(room);
                    await SendHostState(room);
                    await BroadcastRoomState(room);
                    await Clients.Client(room.HostConnectionId).SendAsync("HunterShot",
                        new PlayerDto(executed.Id, executed.Name, false, "hunter"));
                    return;
                }

                var winner = _engine.CheckWinCondition(room.Players);
                if (winner != null)
                {
                    room.Winner = winner;
                    room.Phase = GamePhase.Ended;
                    room.VoteSession = new VoteSession();
                    Save(room);
                    await BroadcastGameEnded(room);
                    return;
                }

                room.VoteSession = new VoteSession();
                room.Phase = GamePhase.Day;
                Save(room);
                await SendHostState(room);
                await BroadcastRoomState(room);
            }
        }
    }

    public async Task ConfirmExecute(string roomCode, string targetId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        _voteTimer.CancelTimer(roomCode);

        if (room.Players.TryGetValue(targetId, out var player))
        {
            player.IsAlive = false;
            room.VoteSession = new VoteSession();
            room.LastActivity = DateTime.UtcNow;

            await Clients.Group(roomCode).SendAsync("VoteExecuted",
                new PlayerDto(player.Id, player.Name, false, player.Role?.ToString()?.ToLower()));

            // Elder killed by village → all villagers lose special powers
            if (player.Role == Role.Elder)
            {
                ApplyElderPenalty(room);
                room.PendingAnnouncements.Add("Già làng bị treo cổ! Toàn bộ dân làng mất năng lực đặc biệt.");
            }

            // Hunter death trigger
            if (player.Role == Role.Hunter)
            {
                room.HunterPendingShot = player.Id;
                Save(room);
                await SendHostState(room);
                await BroadcastRoomState(room);
                await Clients.Client(room.HostConnectionId).SendAsync("HunterShot",
                    new PlayerDto(player.Id, player.Name, false, "hunter"));
                return;
            }

            var winner = _engine.CheckWinCondition(room.Players);
            if (winner != null)
            {
                room.Winner = winner;
                room.Phase = GamePhase.Ended;
                Save(room);
                await BroadcastGameEnded(room);
                return;
            }

            Save(room);
            await SendHostState(room);
            await BroadcastRoomState(room);
        }
    }

    public async Task SkipVote(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        _voteTimer.CancelTimer(roomCode);
        // Force close and auto-execute (random for non-voters)
        await AutoCloseVote(room);
    }

    // === Night transition ===

    public async Task StartNight(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        room.Round++;
        room.Phase = GamePhase.Night;
        room.NightStepIndex = 0;
        var lastDoctorSave = room.NightActions.DoctorSave;
        var lastGuardProtect = room.NightActions.GuardProtect;
        room.NightActions = new NightActions
        {
            WitchHealUsed = room.NightActions.WitchHealUsed,
            WitchPoisonUsed = room.NightActions.WitchPoisonUsed,
            AlphaWolfConvertUsed = room.NightActions.AlphaWolfConvertUsed,
            LastDoctorSave = lastDoctorSave,
            LastGuardProtect = lastGuardProtect,
        };
        room.HunterPendingShot = null;
        room.LastActivity = DateTime.UtcNow;
        Save(room);

        await SendNightStep(room);
        await SendHostState(room);
        await BroadcastRoomState(room);
    }

    // === New Game ===

    public async Task NewGame(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        foreach (var p in room.Players.Values)
        {
            p.Role = null;
            p.IsAlive = true;
        }
        room.Phase = GamePhase.Lobby;
        room.Round = 0;
        room.NightStepIndex = 0;
        room.NightActions = new NightActions();
        room.VoteSession = new VoteSession();
        room.PendingAnnouncements = new();
        room.Winner = null;
        room.HunterPendingShot = null;
        room.ElderLives = new();
        room.LastActivity = DateTime.UtcNow;
        Save(room);

        await SendHostState(room);
        await BroadcastRoomState(room);
    }

    // === Reconnect ===

    public async Task RejoinRoom(string roomCode, string playerId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null)
        {
            await Clients.Caller.SendAsync("Error", "Phòng không tồn tại.");
            return;
        }

        var player = room.Players.Values.FirstOrDefault(p => p.Id == playerId);
        if (player == null)
        {
            await Clients.Caller.SendAsync("Error", "Người chơi không tồn tại trong phòng.");
            return;
        }

        player.ConnectionId = Context.ConnectionId;
        Save(room);

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await Clients.Caller.SendAsync("JoinedRoom", roomCode, player.Id);

        if (player.Role != null)
            await Clients.Caller.SendAsync("RoleAssigned", player.Role.ToString()!.ToLower());

        await BroadcastRoomState(room);
    }

    public async Task RejoinHost(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null)
        {
            await Clients.Caller.SendAsync("Error", "Phòng không tồn tại.");
            return;
        }

        room.HostConnectionId = Context.ConnectionId;
        Save(room);

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await SendHostState(room);

        if (room.Phase == GamePhase.Night)
            await SendNightStep(room);
    }

    // === Disconnect ===

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }

    // === Helper Methods ===

    private bool IsHost(GameRoom room) => room.HostConnectionId == Context.ConnectionId;

    private void Save(GameRoom room) => _rooms.SaveToDb(room);

    /// <summary>Elder killed by village vote: all villagers lose special powers (become Villager)</summary>
    private static void ApplyElderPenalty(GameRoom room)
    {
        foreach (var p in room.Players.Values)
        {
            if (p.IsAlive && !GameEngine.IsWolfTeam(p.Role) && p.Role != Role.Villager && p.Role != Role.Elder)
            {
                p.Role = Role.Villager;
            }
        }
    }

    private string? ValidateNightStepCompleted(GameRoom room, Role role)
    {
        return role switch
        {
            Role.Wolf => room.NightActions.WolfVictim == null ? "Sói phải chọn nạn nhân!" : null,
            Role.Seer => room.NightActions.SeerTarget == null ? "Tiên tri phải chọn người để soi!" : null,
            Role.Guard => room.NightActions.GuardProtect == null ? "Bảo vệ phải chọn người bảo vệ!" : null,
            Role.Doctor => room.NightActions.DoctorSave == null ? "Thầy thuốc phải chọn người cứu!" : null,
            // AlphaWolf, Witch, Hunter are optional
            _ => null,
        };
    }

    private async Task BroadcastRoomState(GameRoom room)
    {
        var deadlineMs = room.VoteSession.Deadline.HasValue
            ? (long?)new DateTimeOffset(room.VoteSession.Deadline.Value).ToUnixTimeMilliseconds()
            : null;

        var state = new GameStateDto(
            room.Code,
            room.Phase.ToString().ToLower(),
            room.Players.Values.Select(p => new PlayerDto(p.Id, p.Name, p.IsAlive)).ToList(),
            room.Round,
            room.Config,
            new VoteSessionDto(room.VoteSession.IsOpen, GetVoteCounts(room), deadlineMs),
            room.PendingAnnouncements,
            room.Winner
        );
        await Clients.Group(room.Code).SendAsync("RoomState", state);
    }

    private async Task SendHostState(GameRoom room)
    {
        var deadlineMs = room.VoteSession.Deadline.HasValue
            ? (long?)new DateTimeOffset(room.VoteSession.Deadline.Value).ToUnixTimeMilliseconds()
            : null;

        var state = new GameStateDto(
            room.Code,
            room.Phase.ToString().ToLower(),
            room.Players.Values.Select(p => new PlayerDto(p.Id, p.Name, p.IsAlive,
                p.Role?.ToString()?.ToLower())).ToList(),
            room.Round,
            room.Config,
            new VoteSessionDto(room.VoteSession.IsOpen, GetVoteCounts(room), deadlineMs),
            room.PendingAnnouncements,
            room.Winner
        );
        await Clients.Client(room.HostConnectionId).SendAsync("HostState", state);
    }

    private async Task SendNightStep(GameRoom room)
    {
        if (room.NightStepIndex >= room.NightStepOrder.Count) return;

        var role = room.NightStepOrder[room.NightStepIndex];
        var labels = new Dictionary<Role, (string label, string instruction)>
        {
            [Role.Wolf] = ("Sói thức dậy", "Sói chọn nạn nhân"),
            [Role.AlphaWolf] = ("Sói Đầu Đàn thức dậy", "Sói Đầu Đàn chọn biến hình hoặc bỏ qua"),
            [Role.Seer] = ("Tiên tri thức dậy", "Tiên tri chọn người để soi"),
            [Role.Guard] = ("Bảo vệ thức dậy", "Bảo vệ chọn người bảo vệ"),
            [Role.Doctor] = ("Thầy thuốc thức dậy", "Thầy thuốc chọn người cứu"),
            [Role.Witch] = ("Phù thủy thức dậy", "Phù thủy dùng thuốc"),
            [Role.Hunter] = ("Thợ săn thức dậy", "Thợ săn chọn mục tiêu"),
        };

        var (label, instruction) = labels.GetValueOrDefault(role, ("", ""));

        // Build extra info for night step
        var extraInfo = new Dictionary<string, object>();

        if (role == Role.Wolf)
        {
            // Include both Wolf and AlphaWolf as wolf team
            var wolfIds = room.Players.Values
                .Where(p => GameEngine.IsWolfTeam(p.Role) && p.IsAlive)
                .Select(p => p.Id)
                .ToList();
            extraInfo["wolfPlayerIds"] = wolfIds;
        }

        if (role == Role.AlphaWolf)
        {
            extraInfo["convertUsed"] = room.NightActions.AlphaWolfConvertUsed;
            // Show non-wolf alive players as targets
            var wolfIds = room.Players.Values
                .Where(p => GameEngine.IsWolfTeam(p.Role) && p.IsAlive)
                .Select(p => p.Id)
                .ToList();
            extraInfo["wolfPlayerIds"] = wolfIds;
        }

        if (role == Role.Guard && room.NightActions.LastGuardProtect != null)
        {
            extraInfo["lastGuardProtect"] = room.NightActions.LastGuardProtect;
        }

        if (role == Role.Doctor && room.NightActions.LastDoctorSave != null)
        {
            extraInfo["lastDoctorSave"] = room.NightActions.LastDoctorSave;
        }

        if (role == Role.Witch)
        {
            extraInfo["healUsed"] = room.NightActions.WitchHealUsed;
            extraInfo["poisonUsed"] = room.NightActions.WitchPoisonUsed;
        }

        var alivePlayers = room.Players.Values
            .Where(p => p.IsAlive)
            .Select(p => new PlayerDto(p.Id, p.Name, p.IsAlive, p.Role?.ToString()?.ToLower()))
            .ToList();

        var step = new NightStepDto(
            role.ToString().ToLower(),
            label,
            instruction,
            room.NightStepIndex,
            room.NightStepOrder.Count,
            alivePlayers
        );

        await Clients.Client(room.HostConnectionId).SendAsync("NightStep", step, extraInfo);
    }

    private async Task BroadcastVoteCounts(GameRoom room)
    {
        var counts = GetVoteCounts(room);
        var votedCount = room.VoteSession.Votes.Count;
        var aliveCount = room.Players.Values.Count(p => p.IsAlive);
        await Clients.Group(room.Code).SendAsync("VoteUpdated", counts, votedCount, aliveCount);
    }

    private Dictionary<string, int> GetVoteCounts(GameRoom room)
    {
        var counts = new Dictionary<string, int>();
        foreach (var targetId in room.VoteSession.Votes.Values)
        {
            counts[targetId] = counts.GetValueOrDefault(targetId, 0) + 1;
        }
        return counts;
    }

    private async Task BroadcastGameEnded(GameRoom room)
    {
        var reveals = room.Players.Values
            .Select(p => new RevealDto(p.Id, p.Name, p.Role?.ToString()?.ToLower() ?? "unknown", p.IsAlive))
            .ToList();

        await Clients.Group(room.Code).SendAsync("GameEnded", room.Winner, reveals);
        await SendHostState(room);
    }
}
