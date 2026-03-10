using Microsoft.AspNetCore.SignalR;
using MaSoiBackend.Models;
using MaSoiBackend.Services;

namespace MaSoiBackend.Hubs;

public class GameHub : Hub
{
    private readonly RoomManager _rooms;
    private readonly GameEngine _engine;

    public GameHub(RoomManager rooms, GameEngine engine)
    {
        _rooms = rooms;
        _engine = engine;
    }

    // === Room Management ===

    public async Task CreateRoom()
    {
        var room = _rooms.CreateRoom(Context.ConnectionId);
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
                room.NightActions.WolfVictim = targetId;
                break;
            case "seer":
                room.NightActions.SeerTarget = targetId;
                if (targetId != null && room.Players.TryGetValue(targetId, out var target))
                    room.NightActions.SeerResult = target.Role == Role.Wolf ? "wolf" : "not-wolf";
                break;
            case "doctor":
                room.NightActions.DoctorSave = targetId;
                break;
            case "witch":
                if (targetId != null && targetId.StartsWith("heal:"))
                {
                    room.NightActions.WitchHeal = targetId[5..];
                    room.NightActions.WitchHealUsed = true;
                }
                else if (targetId != null && targetId.StartsWith("poison:"))
                {
                    room.NightActions.WitchPoison = targetId[7..];
                    room.NightActions.WitchPoisonUsed = true;
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

        var (deaths, announcements) = _engine.ResolveNight(room.Players, room.NightActions);

        foreach (var pid in deaths)
        {
            if (room.Players.TryGetValue(pid, out var p))
                p.IsAlive = false;
        }

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

        room.Phase = GamePhase.Voting;
        room.VoteSession = new VoteSession { IsOpen = true, Votes = new() };
        room.LastActivity = DateTime.UtcNow;

        var candidates = room.Players.Values
            .Where(p => p.IsAlive)
            .Select(p => new PlayerDto(p.Id, p.Name, p.IsAlive))
            .ToList();

        Save(room);
        await Clients.Group(roomCode).SendAsync("VoteOpened", candidates);
        await SendHostState(room);
        await BroadcastRoomState(room);
    }

    public async Task CastVote(string roomCode, string targetId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !room.VoteSession.IsOpen) return;

        var voter = room.Players.Values.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
        if (voter == null || !voter.IsAlive) return;

        room.VoteSession.Votes[voter.Id] = targetId;
        room.LastActivity = DateTime.UtcNow;
        Save(room);

        await BroadcastVoteCounts(room);
    }

    public async Task ConfirmExecute(string roomCode, string targetId)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        if (room.Players.TryGetValue(targetId, out var player))
        {
            player.IsAlive = false;
            room.VoteSession = new VoteSession();
            room.LastActivity = DateTime.UtcNow;

            await Clients.Group(roomCode).SendAsync("VoteExecuted",
                new PlayerDto(player.Id, player.Name, false, player.Role?.ToString()?.ToLower()));

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

        room.VoteSession = new VoteSession();
        room.Phase = GamePhase.Day;
        room.LastActivity = DateTime.UtcNow;
        Save(room);

        await SendHostState(room);
        await BroadcastRoomState(room);
    }

    // === Night transition ===

    public async Task StartNight(string roomCode)
    {
        var room = _rooms.GetRoom(roomCode);
        if (room == null || !IsHost(room)) return;

        room.Round++;
        room.Phase = GamePhase.Night;
        room.NightStepIndex = 0;
        room.NightActions = new NightActions
        {
            WitchHealUsed = room.NightActions.WitchHealUsed,
            WitchPoisonUsed = room.NightActions.WitchPoisonUsed
        };
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

        // Update connection id
        player.ConnectionId = Context.ConnectionId;
        Save(room);

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await Clients.Caller.SendAsync("JoinedRoom", roomCode, player.Id);

        // Re-send role if game has started
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

        // Update host connection
        room.HostConnectionId = Context.ConnectionId;
        Save(room);

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await SendHostState(room);

        // Re-send night step if in night phase
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

    private async Task BroadcastRoomState(GameRoom room)
    {
        var state = new GameStateDto(
            room.Code,
            room.Phase.ToString().ToLower(),
            room.Players.Values.Select(p => new PlayerDto(p.Id, p.Name, p.IsAlive)).ToList(),
            room.Round,
            room.Config,
            new VoteSessionDto(room.VoteSession.IsOpen, GetVoteCounts(room)),
            room.PendingAnnouncements,
            room.Winner
        );
        await Clients.Group(room.Code).SendAsync("RoomState", state);
    }

    private async Task SendHostState(GameRoom room)
    {
        var state = new GameStateDto(
            room.Code,
            room.Phase.ToString().ToLower(),
            room.Players.Values.Select(p => new PlayerDto(p.Id, p.Name, p.IsAlive,
                p.Role?.ToString()?.ToLower())).ToList(),
            room.Round,
            room.Config,
            new VoteSessionDto(room.VoteSession.IsOpen, GetVoteCounts(room)),
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
            [Role.Seer] = ("Tiên tri thức dậy", "Tiên tri chọn người để soi"),
            [Role.Doctor] = ("Thầy thuốc thức dậy", "Thầy thuốc chọn người cứu"),
            [Role.Witch] = ("Phù thủy thức dậy", "Phù thủy dùng thuốc"),
            [Role.Hunter] = ("Thợ săn thức dậy", "Thợ săn chọn mục tiêu"),
        };

        var (label, instruction) = labels.GetValueOrDefault(role, ("", ""));
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

        await Clients.Client(room.HostConnectionId).SendAsync("NightStep", step);
    }

    private async Task BroadcastVoteCounts(GameRoom room)
    {
        var counts = GetVoteCounts(room);
        await Clients.Group(room.Code).SendAsync("VoteUpdated", counts);
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
