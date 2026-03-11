using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using MaSoiBackend.Hubs;

namespace MaSoiBackend.Services;

public class VoteTimerService
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _timers = new();
    private readonly IServiceProvider _services;

    public VoteTimerService(IServiceProvider services)
    {
        _services = services;
    }

    public void StartTimer(string roomCode, int seconds)
    {
        CancelTimer(roomCode);

        var cts = new CancellationTokenSource();
        _timers[roomCode] = cts;

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(seconds), cts.Token);
                if (cts.Token.IsCancellationRequested) return;

                using var scope = _services.CreateScope();
                var rooms = scope.ServiceProvider.GetRequiredService<RoomManager>();
                var hub = scope.ServiceProvider.GetRequiredService<IHubContext<GameHub>>();

                var room = rooms.GetRoom(roomCode);
                if (room == null || !room.VoteSession.IsOpen) return;

                // Auto-random for non-voters
                var alivePlayers = room.Players.Values.Where(p => p.IsAlive).ToList();
                var aliveIds = alivePlayers.Select(p => p.Id).ToList();
                var rng = new Random();

                foreach (var player in alivePlayers)
                {
                    if (!room.VoteSession.Votes.ContainsKey(player.Id))
                    {
                        var candidates = aliveIds.Where(id => id != player.Id).ToList();
                        if (candidates.Count > 0)
                            room.VoteSession.Votes[player.Id] = candidates[rng.Next(candidates.Count)];
                    }
                }

                room.VoteSession.IsOpen = false;
                rooms.SaveToDb(room);

                // Broadcast final counts
                var counts = new Dictionary<string, int>();
                foreach (var targetId in room.VoteSession.Votes.Values)
                    counts[targetId] = counts.GetValueOrDefault(targetId, 0) + 1;

                await hub.Clients.Group(roomCode).SendAsync("VoteUpdated", counts,
                    room.VoteSession.Votes.Count, alivePlayers.Count);
                await hub.Clients.Group(roomCode).SendAsync("VoteClosed");

                // Auto-execute
                if (counts.Count > 0)
                {
                    var maxVotes = counts.Values.Max();
                    var topVoted = counts.Where(kv => kv.Value == maxVotes).Select(kv => kv.Key).ToList();
                    var executedId = topVoted[rng.Next(topVoted.Count)];

                    if (room.Players.TryGetValue(executedId, out var executed))
                    {
                        executed.IsAlive = false;

                        await hub.Clients.Group(roomCode).SendAsync("VoteExecuted",
                            new Models.PlayerDto(executed.Id, executed.Name, false,
                                executed.Role?.ToString()?.ToLower()));

                        // Hunter death trigger
                        if (executed.Role == Models.Role.Hunter)
                        {
                            room.HunterPendingShot = executed.Id;
                            room.VoteSession = new Models.VoteSession();
                            rooms.SaveToDb(room);

                            // Send host state with roles
                            await SendHostStateViaHub(hub, room);
                            await SendRoomStateViaHub(hub, room);
                            await hub.Clients.Client(room.HostConnectionId).SendAsync("HunterShot",
                                new Models.PlayerDto(executed.Id, executed.Name, false, "hunter"));
                            return;
                        }

                        var engine = scope.ServiceProvider.GetRequiredService<GameEngine>();
                        var winner = engine.CheckWinCondition(room.Players);
                        if (winner != null)
                        {
                            room.Winner = winner;
                            room.Phase = Models.GamePhase.Ended;
                            room.VoteSession = new Models.VoteSession();
                            rooms.SaveToDb(room);

                            var reveals = room.Players.Values
                                .Select(p => new Models.RevealDto(p.Id, p.Name,
                                    p.Role?.ToString()?.ToLower() ?? "unknown", p.IsAlive))
                                .ToList();
                            await hub.Clients.Group(roomCode).SendAsync("GameEnded", winner, reveals);
                            await SendHostStateViaHub(hub, room);
                            return;
                        }

                        room.VoteSession = new Models.VoteSession();
                        room.Phase = Models.GamePhase.Day;
                        rooms.SaveToDb(room);
                        await SendHostStateViaHub(hub, room);
                        await SendRoomStateViaHub(hub, room);
                    }
                }
            }
            catch (TaskCanceledException) { }
            catch (Exception ex)
            {
                Console.WriteLine($"[VoteTimer] Error: {ex.Message}");
            }
            finally
            {
                _timers.TryRemove(roomCode, out _);
            }
        });
    }

    public void CancelTimer(string roomCode)
    {
        if (_timers.TryRemove(roomCode, out var cts))
        {
            cts.Cancel();
            cts.Dispose();
        }
    }

    private static async Task SendHostStateViaHub(IHubContext<GameHub> hub, Models.GameRoom room)
    {
        var deadlineMs = room.VoteSession.Deadline.HasValue
            ? (long?)new DateTimeOffset(room.VoteSession.Deadline.Value).ToUnixTimeMilliseconds()
            : null;

        var state = new Models.GameStateDto(
            room.Code,
            room.Phase.ToString().ToLower(),
            room.Players.Values.Select(p => new Models.PlayerDto(p.Id, p.Name, p.IsAlive,
                p.Role?.ToString()?.ToLower())).ToList(),
            room.Round,
            room.Config,
            new Models.VoteSessionDto(room.VoteSession.IsOpen, GetVoteCounts(room), deadlineMs),
            room.PendingAnnouncements,
            room.Winner
        );
        await hub.Clients.Client(room.HostConnectionId).SendAsync("HostState", state);
    }

    private static async Task SendRoomStateViaHub(IHubContext<GameHub> hub, Models.GameRoom room)
    {
        var deadlineMs = room.VoteSession.Deadline.HasValue
            ? (long?)new DateTimeOffset(room.VoteSession.Deadline.Value).ToUnixTimeMilliseconds()
            : null;

        var state = new Models.GameStateDto(
            room.Code,
            room.Phase.ToString().ToLower(),
            room.Players.Values.Select(p => new Models.PlayerDto(p.Id, p.Name, p.IsAlive)).ToList(),
            room.Round,
            room.Config,
            new Models.VoteSessionDto(room.VoteSession.IsOpen, GetVoteCounts(room), deadlineMs),
            room.PendingAnnouncements,
            room.Winner
        );
        await hub.Clients.Group(room.Code).SendAsync("RoomState", state);
    }

    private static Dictionary<string, int> GetVoteCounts(Models.GameRoom room)
    {
        var counts = new Dictionary<string, int>();
        foreach (var targetId in room.VoteSession.Votes.Values)
            counts[targetId] = counts.GetValueOrDefault(targetId, 0) + 1;
        return counts;
    }
}
