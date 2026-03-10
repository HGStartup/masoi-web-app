using MaSoiBackend.Models;

namespace MaSoiBackend.Services;

public class GameEngine
{
    private static readonly Role[] NightOrder = { Role.Wolf, Role.Seer, Role.Doctor, Role.Witch, Role.Hunter };
    private static readonly Random Rng = new();

    public static readonly Dictionary<Role, string> RoleNames = new()
    {
        [Role.Wolf] = "Sói",
        [Role.Villager] = "Dân thường",
        [Role.Seer] = "Tiên tri",
        [Role.Doctor] = "Thầy thuốc",
        [Role.Witch] = "Phù thủy",
        [Role.Hunter] = "Thợ săn",
    };

    public static readonly Dictionary<Role, string> RoleIcons = new()
    {
        [Role.Wolf] = "🐺",
        [Role.Villager] = "👤",
        [Role.Seer] = "🔮",
        [Role.Doctor] = "💊",
        [Role.Witch] = "🧪",
        [Role.Hunter] = "🏹",
    };

    public List<Role> GetNightOrder(Dictionary<string, int> roleConfig)
    {
        return NightOrder
            .Where(r => roleConfig.TryGetValue(r.ToString().ToLower(), out var count) && count > 0)
            .ToList();
    }

    public void AssignRoles(Dictionary<string, Player> players, Dictionary<string, int> roleConfig)
    {
        var roles = new List<Role>();
        foreach (var (roleStr, count) in roleConfig)
        {
            if (Enum.TryParse<Role>(roleStr, true, out var role))
            {
                for (int i = 0; i < count; i++)
                    roles.Add(role);
            }
        }

        var playerIds = players.Keys.ToList();
        if (playerIds.Count != roles.Count)
            throw new InvalidOperationException($"Player count ({playerIds.Count}) does not match role count ({roles.Count})");

        // Fisher-Yates shuffle
        for (int i = roles.Count - 1; i > 0; i--)
        {
            int j = Rng.Next(i + 1);
            (roles[i], roles[j]) = (roles[j], roles[i]);
        }

        for (int i = 0; i < playerIds.Count; i++)
        {
            players[playerIds[i]].Role = roles[i];
        }
    }

    public (List<string> Deaths, List<string> Announcements) ResolveNight(
        Dictionary<string, Player> players, NightActions actions)
    {
        var deaths = new List<string>();
        var announcements = new List<string>();

        bool wolfVictimDies = false;
        if (!string.IsNullOrEmpty(actions.WolfVictim))
        {
            wolfVictimDies = true;

            if (actions.DoctorSave == actions.WolfVictim)
                wolfVictimDies = false;
            if (actions.WitchHeal == actions.WolfVictim)
                wolfVictimDies = false;

            if (wolfVictimDies)
            {
                deaths.Add(actions.WolfVictim);
                var victim = players.GetValueOrDefault(actions.WolfVictim);
                announcements.Add($"{victim?.Name ?? "Một người"} đã bị loại đêm qua.");
            }
            else
            {
                announcements.Add("Đêm qua, mọi người đều bình an.");
            }
        }
        else
        {
            announcements.Add("Đêm qua, Sói không giết ai.");
        }

        if (!string.IsNullOrEmpty(actions.WitchPoison) && actions.WitchPoison != actions.WolfVictim)
        {
            deaths.Add(actions.WitchPoison);
            var poisoned = players.GetValueOrDefault(actions.WitchPoison);
            announcements.Add($"{poisoned?.Name ?? "Một người"} đã bị đầu độc.");
        }

        return (deaths, announcements);
    }

    public string? CheckWinCondition(Dictionary<string, Player> players)
    {
        var alive = players.Values.Where(p => p.IsAlive).ToList();
        int aliveWolves = alive.Count(p => p.Role == Role.Wolf);
        int aliveOthers = alive.Count(p => p.Role != Role.Wolf);

        if (aliveWolves == 0) return "village";
        if (aliveWolves >= aliveOthers) return "wolves";
        return null;
    }

    public string GenerateRoomCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 4).Select(_ => chars[Rng.Next(chars.Length)]).ToArray());
    }

    public Player CreatePlayer(string name, string connectionId)
    {
        return new Player
        {
            Id = Guid.NewGuid().ToString("N")[..8],
            ConnectionId = connectionId,
            Name = name,
            IsAlive = true
        };
    }

    public string? ValidateRoleConfig(Dictionary<string, int> roles, int playerCount)
    {
        int total = roles.Values.Sum();
        if (total != playerCount)
            return $"Tổng số vai ({total}) phải bằng số người chơi ({playerCount})";

        int wolfCount = roles.GetValueOrDefault("wolf", 0);
        if (wolfCount < 1)
            return "Phải có ít nhất 1 Sói";

        int villagerCount = roles.Where(r => r.Key != "wolf").Sum(r => r.Value);
        if (villagerCount == 0)
            return "Phải có ít nhất 1 người làng";

        return null;
    }
}
