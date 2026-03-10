using Microsoft.EntityFrameworkCore;

namespace MaSoiBackend.Data;

public class AppDbContext : DbContext
{
    public DbSet<RoomEntity> Rooms => Set<RoomEntity>();
    public DbSet<PlayerEntity> Players => Set<PlayerEntity>();

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<RoomEntity>(e =>
        {
            e.HasKey(r => r.Code);
            e.Property(r => r.Code).HasMaxLength(6);
        });

        modelBuilder.Entity<PlayerEntity>(e =>
        {
            e.HasKey(p => p.Id);
            e.Property(p => p.Id).HasMaxLength(16);
            e.HasIndex(p => p.ConnectionId);
            e.HasIndex(p => p.RoomCode);
        });
    }
}

public class RoomEntity
{
    public string Code { get; set; } = "";
    public string HostConnectionId { get; set; } = "";
    public string Phase { get; set; } = "lobby";
    public int Round { get; set; }
    public string ConfigJson { get; set; } = "{}";
    public int NightStepIndex { get; set; }
    public string NightStepOrderJson { get; set; } = "[]";
    public string NightActionsJson { get; set; } = "{}";
    public string AnnouncementsJson { get; set; } = "[]";
    public string VotesJson { get; set; } = "{}";
    public string? Winner { get; set; }
    public DateTime LastActivity { get; set; } = DateTime.UtcNow;
}

public class PlayerEntity
{
    public string Id { get; set; } = "";
    public string RoomCode { get; set; } = "";
    public string? ConnectionId { get; set; }
    public string Name { get; set; } = "";
    public string? Role { get; set; }
    public bool IsAlive { get; set; } = true;
}
