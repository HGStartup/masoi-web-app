using System.Text.Json;
using MaSoiBackend.Models;
using Microsoft.Extensions.Options;

namespace MaSoiBackend.Services;

public class ZaloAuthService
{
    private readonly HttpClient _http;
    private readonly ZaloConfig _config;

    public ZaloAuthService(HttpClient http, IOptions<ZaloConfig> config)
    {
        _http = http;
        _config = config.Value;
    }

    public string GetLoginUrl(string? state = null)
    {
        var url = "https://oauth.zaloapp.com/v4/permission"
            + $"?app_id={_config.AppId}"
            + $"&redirect_uri={Uri.EscapeDataString(_config.RedirectUri)}"
            + "&code_challenge=your_code_challenge"
            + "&state=" + (state ?? "")
            ;

        return url;
    }

    public async Task<ZaloTokenResponse?> ExchangeCodeAsync(string code, string codeVerifier)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "https://oauth.zaloapp.com/v4/access_token");
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["code"] = code,
            ["app_id"] = _config.AppId,
            ["grant_type"] = "authorization_code",
            ["code_verifier"] = codeVerifier,
        });
        request.Headers.Add("secret_key", _config.AppSecret);

        var response = await _http.SendAsync(request);
        var json = await response.Content.ReadAsStringAsync();

        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
        return JsonSerializer.Deserialize<ZaloTokenResponse>(json, options);
    }

    public async Task<ZaloUserInfo?> GetUserInfoAsync(string accessToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Get,
            "https://graph.zalo.me/v2.0/me?fields=id,name,picture");
        request.Headers.Add("access_token", accessToken);

        var response = await _http.SendAsync(request);
        var json = await response.Content.ReadAsStringAsync();

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        if (root.TryGetProperty("error", out var errorCode) && errorCode.GetInt32() != 0)
            return null;

        var user = new ZaloUserInfo
        {
            Id = root.GetProperty("id").GetString() ?? "",
            Name = root.GetProperty("name").GetString() ?? "",
        };

        if (root.TryGetProperty("picture", out var pic)
            && pic.TryGetProperty("data", out var data)
            && data.TryGetProperty("url", out var url))
        {
            user.Picture = url.GetString() ?? "";
        }

        return user;
    }
}
