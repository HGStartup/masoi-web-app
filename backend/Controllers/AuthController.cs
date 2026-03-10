using MaSoiBackend.Models;
using MaSoiBackend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace MaSoiBackend.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly ZaloAuthService _zalo;
    private readonly ZaloConfig _config;

    public AuthController(ZaloAuthService zalo, IOptions<ZaloConfig> config)
    {
        _zalo = zalo;
        _config = config.Value;
    }

    [HttpGet("zalo/config")]
    public IActionResult GetZaloConfig()
    {
        return Ok(new
        {
            appId = _config.AppId,
            redirectUri = _config.RedirectUri,
        });
    }

    [HttpPost("zalo/token")]
    public async Task<IActionResult> ExchangeToken([FromBody] ZaloTokenRequest request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.Code))
                return Ok(new AuthResponse { Success = false, Error = "Thiếu mã xác thực" });

            var tokenResponse = await _zalo.ExchangeCodeAsync(request.Code, request.CodeVerifier ?? "");

            if (tokenResponse == null || string.IsNullOrEmpty(tokenResponse.AccessToken))
            {
                var err = tokenResponse?.ErrorName != null
                    ? $"{tokenResponse.ErrorName}: {tokenResponse.ErrorDescription}"
                    : "Không thể lấy token từ Zalo";
                Console.WriteLine($"[ZaloAuth] Token exchange failed: {err}");
                return Ok(new AuthResponse { Success = false, Error = err });
            }

            var user = await _zalo.GetUserInfoAsync(tokenResponse.AccessToken);
            if (user == null)
            {
                return Ok(new AuthResponse
                {
                    Success = false,
                    Error = "Không thể lấy thông tin người dùng từ Zalo"
                });
            }

            return Ok(new AuthResponse { Success = true, User = user });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[ZaloAuth] Exception: {ex}");
            return Ok(new AuthResponse { Success = false, Error = $"Lỗi server: {ex.Message}" });
        }
    }
}

public class ZaloTokenRequest
{
    public string Code { get; set; } = "";
    public string? CodeVerifier { get; set; }
}
