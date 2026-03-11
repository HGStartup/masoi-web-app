using System.Collections.Concurrent;
using System.Text.Json;
using MaSoiBackend.Data;
using MaSoiBackend.Models;
using Microsoft.EntityFrameworkCore;

namespace MaSoiBackend.Services;

public class RoomManager : IDisposable
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();
    private readonly GameEngine _engine;
    private readonly IServiceProvider _sp;
    private readonly Timer _cleanupTimer;
    private static readonly TimeSpan RoomTtl = TimeSpan.FromHours(2);

    public RoomManager(GameEngine engine, IServiceProvider sp)
    {
        _engine = engine;
        _sp = sp;
        _cleanupTimer = new Timer(Cleanup, null, TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5));
        LoadAllFromDb();
    }

    // ── Load all rooms from DB on startup ──
    private void LoadAllFromDb()
    {
        try
        {
            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var roomEntities = db.Rooms.ToList();
            var playerEntities = db.Players.ToList();
            var playersByRoom = playerEntities.GroupBy(p => p.RoomCode)
                .ToDictionary(g => g.Key, g => g.ToList());

            foreach (var re in roomEntities)
            {
                if (DateTime.UtcNow - re.LastActivity > RoomTtl) continue;

                var room = ToGameRoom(re, playersByRoom.GetValueOrDefault(re.Code) ?? []);
                _rooms[room.Code] = room;
            }
            Console.WriteLine($"[RoomManager] Loaded {_rooms.Count} rooms from DB");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[RoomManager] DB load failed (first run?): {ex.Message}");
        }
    }

    // ── Cleanup expired rooms ──
    private void Cleanup(object? state)
    {
        var now = DateTime.UtcNow;
        foreach (var (code, room) in _rooms)
        {
            if (now - room.LastActivity > RoomTtl)
            {
                _rooms.TryRemove(code, out _);
                DeleteFromDb(code);
                Console.WriteLine($"[RoomManager] Cleaned up room: {code}");
            }
        }
    }

    // ── Public API (same interface as before) ──

    public GameRoom CreateRoom(string hostConnectionId, bool isPublic = true)
    {
        string code;
        if (isPublic)
        {
            // Short 4-char code for public rooms
            do { code = _engine.GenerateRoomCode(); }
            while (_rooms.ContainsKey(code));
        }
        else
        {
            // Long 8-char code for private rooms (harder to guess)
            do { code = _engine.GeneratePrivateRoomCode(); }
            while (_rooms.ContainsKey(code));
        }

        var room = new GameRoom
        {
            Code = code,
            HostConnectionId = hostConnectionId,
            Phase = GamePhase.Lobby,
            IsPublic = isPublic,
            LastActivity = DateTime.UtcNow
        };

        _rooms[code] = room;
        SaveToDb(room);
        return room;
    }

    public List<GameRoom> GetPublicRooms()
    {
        return _rooms.Values
            .Where(r => r.IsPublic && r.Phase == GamePhase.Lobby)
            .OrderByDescending(r => r.LastActivity)
            .Take(20)
            .ToList();
    }

    public GameRoom? GetRoom(string code) =>
        _rooms.TryGetValue(code, out var room) ? room : null;

    public void Touch(string code)
    {
        if (_rooms.TryGetValue(code, out var room))
            room.LastActivity = DateTime.UtcNow;
    }

    public Player? AddPlayer(string code, string name, string connectionId)
    {
        var room = GetRoom(code);
        if (room == null) return null;

        var player = _engine.CreatePlayer(name, connectionId);
        room.Players[player.Id] = player;
        room.LastActivity = DateTime.UtcNow;
        SaveToDb(room);
        return player;
    }

    public void RemovePlayer(string code, string playerId)
    {
        var room = GetRoom(code);
        if (room == null) return;
        room.Players.Remove(playerId);
        room.LastActivity = DateTime.UtcNow;
        SaveToDb(room);
    }

    public void DeleteRoom(string code)
    {
        _rooms.TryRemove(code, out _);
        DeleteFromDb(code);
    }

    /// <summary>Save room state to DB. Call after any state mutation.</summary>
    public void SaveToDb(GameRoom room)
    {
        _ = Task.Run(() =>
        {
            try
            {
                using var scope = _sp.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var entity = ToRoomEntity(room);
                var existing = db.Rooms.Find(room.Code);
                if (existing != null)
                {
                    db.Entry(existing).CurrentValues.SetValues(entity);
                }
                else
                {
                    db.Rooms.Add(entity);
                }

                // Sync players
                var dbPlayers = db.Players.Where(p => p.RoomCode == room.Code).ToList();
                var roomPlayerIds = room.Players.Keys.ToHashSet();

                // Remove deleted
                foreach (var dp in dbPlayers.Where(dp => !roomPlayerIds.Contains(dp.Id)))
                    db.Players.Remove(dp);

                // Upsert current
                foreach (var (id, player) in room.Players)
                {
                    var pe = ToPlayerEntity(player, room.Code);
                    var dbp = dbPlayers.FirstOrDefault(p => p.Id == id);
                    if (dbp != null)
                        db.Entry(dbp).CurrentValues.SetValues(pe);
                    else
                        db.Players.Add(pe);
                }

                db.SaveChanges();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RoomManager] SaveToDb error: {ex.Message}");
            }
        });
    }

    // ── Reconnect helpers ──

    public (GameRoom room, Player player)? FindByConnectionId(string connectionId)
    {
        foreach (var (_, room) in _rooms)
        {
            var player = room.Players.Values.FirstOrDefault(p => p.ConnectionId == connectionId);
            if (player != null) return (room, player);
        }
        return null;
    }

    public GameRoom? FindHostRoom(string connectionId)
    {
        return _rooms.Values.FirstOrDefault(r => r.HostConnectionId == connectionId);
    }

    // ── Conversion helpers ──

    private static RoomEntity ToRoomEntity(GameRoom r) => new()
    {
        Code = r.Code,
        HostConnectionId = r.HostConnectionId,
        Phase = r.Phase.ToString().ToLower(),
        Round = r.Round,
        ConfigJson = JsonSerializer.Serialize(r.Config),
        NightStepIndex = r.NightStepIndex,
        NightStepOrderJson = JsonSerializer.Serialize(r.NightStepOrder.Select(x => x.ToString().ToLower())),
        NightActionsJson = JsonSerializer.Serialize(r.NightActions),
        AnnouncementsJson = JsonSerializer.Serialize(r.PendingAnnouncements),
        VotesJson = JsonSerializer.Serialize(r.VoteSession),
        ElderLivesJson = JsonSerializer.Serialize(r.ElderLives),
        IsPublic = r.IsPublic,
        Winner = r.Winner,
        LastActivity = r.LastActivity,
    };

    private static GameRoom ToGameRoom(RoomEntity re, List<PlayerEntity> players) => new()
    {
        Code = re.Code,
        HostConnectionId = re.HostConnectionId,
        Phase = Enum.Parse<GamePhase>(re.Phase, ignoreCase: true),
        Round = re.Round,
        Config = JsonSerializer.Deserialize<GameConfig>(re.ConfigJson) ?? new(),
        NightStepIndex = re.NightStepIndex,
        NightStepOrder = DeserializeNightOrder(re.NightStepOrderJson),
        NightActions = JsonSerializer.Deserialize<NightActions>(re.NightActionsJson) ?? new(),
        PendingAnnouncements = JsonSerializer.Deserialize<List<string>>(re.AnnouncementsJson) ?? [],
        VoteSession = JsonSerializer.Deserialize<VoteSession>(re.VotesJson) ?? new(),
        ElderLives = JsonSerializer.Deserialize<Dictionary<string, int>>(re.ElderLivesJson) ?? new(),
        IsPublic = re.IsPublic,
        Winner = re.Winner,
        LastActivity = re.LastActivity,
        Players = players.ToDictionary(p => p.Id, p => new Player
        {
            Id = p.Id,
            ConnectionId = p.ConnectionId,
            Name = p.Name,
            Role = string.IsNullOrEmpty(p.Role) ? null : Enum.Parse<Role>(p.Role, ignoreCase: true),
            IsAlive = p.IsAlive,
        }),
    };

    private static PlayerEntity ToPlayerEntity(Player p, string roomCode) => new()
    {
        Id = p.Id,
        RoomCode = roomCode,
        ConnectionId = p.ConnectionId,
        Name = p.Name,
        Role = p.Role?.ToString()?.ToLower(),
        IsAlive = p.IsAlive,
    };

    private static List<Role> DeserializeNightOrder(string json)
    {
        var strings = JsonSerializer.Deserialize<List<string>>(json) ?? [];
        return strings
            .Select(s => Enum.TryParse<Role>(s, ignoreCase: true, out var r) ? r : (Role?)null)
            .Where(r => r.HasValue)
            .Select(r => r!.Value)
            .ToList();
    }

    private void DeleteFromDb(string code)
    {
        _ = Task.Run(() =>
        {
            try
            {
                using var scope = _sp.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.Players.Where(p => p.RoomCode == code).ExecuteDelete();
                db.Rooms.Where(r => r.Code == code).ExecuteDelete();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[RoomManager] DeleteFromDb error: {ex.Message}");
            }
        });
    }

    public void Dispose() => _cleanupTimer.Dispose();
}
