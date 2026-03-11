using Microsoft.AspNetCore.Mvc;
using MaSoiBackend.Services;

namespace MaSoiBackend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RoomsController : ControllerBase
{
    private readonly RoomManager _rooms;

    public RoomsController(RoomManager rooms)
    {
        _rooms = rooms;
    }

    [HttpGet("public")]
    public IActionResult GetPublicRooms()
    {
        var rooms = _rooms.GetPublicRooms();
        var result = rooms.Select(r => new
        {
            code = r.Code,
            playerCount = r.Players.Count,
            maxPlayers = r.Config.PlayerCount > 0 ? r.Config.PlayerCount : (int?)null,
        });
        return Ok(result);
    }
}
