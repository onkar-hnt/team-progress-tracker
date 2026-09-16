using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Notifications.Application;

namespace Notifications.Api.Controllers;

/// <summary>
/// The caller's own notification inbox. There is no administrator view: every
/// read and every change is filtered to the recipient, and marking one read is
/// the only thing that can change it.
/// </summary>
[ApiController]
[Route("api/notifications")]
[Authorize]
[Tags("Notifications")]
public sealed class NotificationsController(NotificationService notifications) : ControllerBase
{
    /// <summary>Lists the caller's notifications, newest first.</summary>
    /// <param name="limit">How many to return. Omit for the default page.</param>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<NotificationDto>>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<NotificationDto>>>> List(
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        var rows = await notifications.ListAsync(limit, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<NotificationDto>>.Ok(rows));
    }

    /// <summary>How many of the caller's notifications are unread.</summary>
    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(ApiResponse<int>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<int>>> UnreadCount(CancellationToken cancellationToken)
    {
        var count = await notifications.UnreadCountAsync(cancellationToken);

        return Ok(ApiResponse<int>.Ok(count));
    }

    /// <summary>Marks one notification read.</summary>
    /// <response code="404">No such notification for this caller.</response>
    [HttpPost("{id:guid}/read")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse>> MarkRead(Guid id, CancellationToken cancellationToken)
    {
        await notifications.MarkReadAsync(id, cancellationToken);

        return Ok(ApiResponse.Ok("Notification marked as read."));
    }

    /// <summary>Marks everything in the caller's inbox read.</summary>
    [HttpPost("read-all")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse>> MarkAllRead(CancellationToken cancellationToken)
    {
        await notifications.MarkAllReadAsync(cancellationToken);

        return Ok(ApiResponse.Ok("All notifications marked as read."));
    }
}
