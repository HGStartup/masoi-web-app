using MaSoiBackend.Models;

namespace MaSoiBackend.Services;

public class GameEngine
{
    private static readonly Role[] NightOrder = { Role.Wolf, Role.AlphaWolf, Role.Seer, Role.Guard, Role.Doctor, Role.Witch, Role.Hunter };
    private static readonly Random Rng = new();

    public static readonly Dictionary<Role, string> RoleNames = new()
    {
        [Role.Wolf] = "Sói",
        [Role.AlphaWolf] = "Sói Đầu Đàn",
        [Role.Villager] = "Dân thường",
        [Role.Seer] = "Tiên tri",
        [Role.Doctor] = "Thầy thuốc",
        [Role.Witch] = "Phù thủy",
        [Role.Hunter] = "Thợ săn",
        [Role.Guard] = "Bảo vệ",
        [Role.Elder] = "Già làng",
    };

    public static readonly Dictionary<Role, string> RoleIcons = new()
    {
        [Role.Wolf] = "🐺",
        [Role.AlphaWolf] = "🐺",
        [Role.Villager] = "👤",
        [Role.Seer] = "🔮",
        [Role.Doctor] = "💊",
        [Role.Witch] = "🧪",
        [Role.Hunter] = "🏹",
        [Role.Guard] = "🛡️",
        [Role.Elder] = "👴",
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

    public (List<string> Deaths, List<string> Announcements, string? Converted) ResolveNight(
        Dictionary<string, Player> players, NightActions actions, Dictionary<string, int> elderLives)
    {
        var deaths = new List<string>();
        var announcements = new List<string>();
        string? converted = null;

        // Alpha Wolf conversion (instead of normal wolf kill)
        if (!string.IsNullOrEmpty(actions.AlphaWolfConvert))
        {
            var convertTarget = players.GetValueOrDefault(actions.AlphaWolfConvert);
            if (convertTarget != null && !IsWolfTeam(convertTarget.Role))
            {
                converted = actions.AlphaWolfConvert;
                announcements.Add("Đêm qua, mọi người đều bình an.");
                // Wolf victim is overridden by conversion — no kill this night
            }
        }

        if (converted == null)
        {
            // Normal wolf kill
            bool wolfVictimDies = false;
            if (!string.IsNullOrEmpty(actions.WolfVictim))
            {
                wolfVictimDies = true;

                // Guard protection
                if (actions.GuardProtect == actions.WolfVictim)
                    wolfVictimDies = false;
                if (actions.DoctorSave == actions.WolfVictim)
                    wolfVictimDies = false;
                if (actions.WitchHeal == actions.WolfVictim)
                    wolfVictimDies = false;

                // Elder has 2 lives against wolf attacks
                if (wolfVictimDies && players.TryGetValue(actions.WolfVictim, out var victim) && victim.Role == Role.Elder)
                {
                    var lives = elderLives.GetValueOrDefault(actions.WolfVictim, 2);
                    if (lives > 1)
                    {
                        elderLives[actions.WolfVictim] = lives - 1;
                        wolfVictimDies = false;
                        announcements.Add("Đêm qua, mọi người đều bình an.");
                    }
                }

                if (wolfVictimDies)
                {
                    deaths.Add(actions.WolfVictim);
                    var v = players.GetValueOrDefault(actions.WolfVictim);
                    announcements.Add($"{v?.Name ?? "Một người"} đã bị loại đêm qua.");
                }
                else if (!announcements.Any())
                {
                    announcements.Add("Đêm qua, mọi người đều bình an.");
                }
            }
            else
            {
                announcements.Add("Đêm qua, Sói không giết ai.");
            }
        }

        if (!string.IsNullOrEmpty(actions.WitchPoison) && actions.WitchPoison != actions.WolfVictim)
        {
            // Guard does NOT protect against witch poison
            deaths.Add(actions.WitchPoison);
            var poisoned = players.GetValueOrDefault(actions.WitchPoison);
            announcements.Add($"{poisoned?.Name ?? "Một người"} đã bị đầu độc.");
        }

        return (deaths, announcements, converted);
    }

    public static bool IsWolfTeam(Role? role) => role == Role.Wolf || role == Role.AlphaWolf;

    public string? CheckWinCondition(Dictionary<string, Player> players)
    {
        var alive = players.Values.Where(p => p.IsAlive).ToList();
        int aliveWolves = alive.Count(p => IsWolfTeam(p.Role));
        int aliveOthers = alive.Count(p => !IsWolfTeam(p.Role));

        if (aliveWolves == 0) return "village";
        if (aliveWolves >= aliveOthers) return "wolves";
        return null;
    }

    public string GenerateRoomCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 4).Select(_ => chars[Rng.Next(chars.Length)]).ToArray());
    }

    public string GeneratePrivateRoomCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        return new string(Enumerable.Range(0, 8).Select(_ => chars[Rng.Next(chars.Length)]).ToArray());
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
