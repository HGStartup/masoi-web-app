namespace MaSoiBackend.Models;

public class ZaloConfig
{
    public string AppId { get; set; } = "";
    public string AppSecret { get; set; } = "";
    public string RedirectUri { get; set; } = "";
}

public class ZaloTokenResponse
{
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public string? ExpiresIn { get; set; }
    public string? ErrorName { get; set; }
    public string? ErrorDescription { get; set; }
}

public class ZaloUserInfo
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Picture { get; set; } = "";
}

public class AuthResponse
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public ZaloUserInfo? User { get; set; }
}
