using MaSoiBackend.Data;
using MaSoiBackend.Hubs;
using MaSoiBackend.Models;
using MaSoiBackend.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddControllers();
builder.Services.AddSingleton<GameEngine>();
builder.Services.AddSingleton<RoomManager>();

// SQLite — use App_Data folder (writable on IIS)
var appDataDir = Path.Combine(builder.Environment.ContentRootPath, "App_Data");
try { Directory.CreateDirectory(appDataDir); }
catch (UnauthorizedAccessException)
{
    // Fallback to temp if IIS can't create App_Data
    appDataDir = Path.Combine(Path.GetTempPath(), "masoi-data");
    Directory.CreateDirectory(appDataDir);
    Console.WriteLine($"[DB] App_Data not writable, using fallback: {appDataDir}");
}
var dbPath = Path.Combine(appDataDir, "masoi.db");
builder.Services.AddDbContext<AppDbContext>(opt => opt.UseSqlite($"Data Source={dbPath}"));

// Zalo OAuth
builder.Services.Configure<ZaloConfig>(builder.Configuration.GetSection("Zalo"));
builder.Services.AddHttpClient<ZaloAuthService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Auto-create/migrate DB
try
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    Console.WriteLine($"[DB] SQLite ready at: {dbPath}");
}
catch (Exception ex)
{
    Console.WriteLine($"[DB] Warning: {ex.Message}");
}

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();
app.MapHub<GameHub>("/gamehub");
app.MapFallbackToFile("index.html");

app.Run();
