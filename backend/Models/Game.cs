namespace MaSoiBackend.Models;

public enum Role
{
    Wolf,
    AlphaWolf,
    Villager,
    Seer,
    Doctor,
    Witch,
    Hunter,
    Guard,
    Elder
}

public enum GamePhase
{
    Lobby,
    Night,
    Day,
    Voting,
    Ended
}

public class Player
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];
    public string? ConnectionId { get; set; }
    public string Name { get; set; } = "";
    public Role? Role { get; set; }
    public bool IsAlive { get; set; } = true;
}

public class NightActions
{
    public string? WolfVictim { get; set; }
    public string? AlphaWolfConvert { get; set; } // Alpha wolf converts instead of killing
    public string? SeerTarget { get; set; }
    public string? SeerResult { get; set; }
    public string? DoctorSave { get; set; }
    public string? GuardProtect { get; set; }
    public string? WitchHeal { get; set; }
    public string? WitchPoison { get; set; }
    public bool WitchHealUsed { get; set; }
    public bool WitchPoisonUsed { get; set; }
    public bool AlphaWolfConvertUsed { get; set; } // One-time ability
    public string? LastDoctorSave { get; set; }
    public string? LastGuardProtect { get; set; } // Guard can't protect same person twice
}

public class VoteSession
{
    public bool IsOpen { get; set; }
    public Dictionary<string, string> Votes { get; set; } = new();
    public DateTime? Deadline { get; set; }
}

public class GameConfig
{
    public int PlayerCount { get; set; }
    public Dictionary<string, int> Roles { get; set; } = new();
}

public class GameRoom
{
    public string Code { get; set; } = "";
    public string HostConnectionId { get; set; } = "";
    public GamePhase Phase { get; set; } = GamePhase.Lobby;
    public GameConfig Config { get; set; } = new();
    public Dictionary<string, Player> Players { get; set; } = new();
    public int Round { get; set; }
    public List<Role> NightStepOrder { get; set; } = new();
    public int NightStepIndex { get; set; }
    public NightActions NightActions { get; set; } = new();
    public VoteSession VoteSession { get; set; } = new();
    public List<string> PendingAnnouncements { get; set; } = new();
    public bool IsPublic { get; set; }
    public string? Winner { get; set; }
    public string? HunterPendingShot { get; set; }
    public Dictionary<string, int> ElderLives { get; set; } = new(); // Elder has 2 lives vs wolves
    public DateTime LastActivity { get; set; } = DateTime.UtcNow;
}

// DTOs for client
public record PlayerDto(string Id, string Name, bool IsAlive, string? Role = null);
public record NightStepDto(string Role, string Label, string Instruction, int StepIndex, int TotalSteps, List<PlayerDto> AlivePlayers);
public record GameStateDto(
    string RoomCode,
    string Phase,
    List<PlayerDto> Players,
    int Round,
    GameConfig Config,
    VoteSessionDto VoteSession,
    List<string> PendingAnnouncements,
    string? Winner
);
public record VoteSessionDto(bool IsOpen, Dictionary<string, int> Counts, long? DeadlineMs);
public record RevealDto(string Id, string Name, string Role, bool IsAlive);
