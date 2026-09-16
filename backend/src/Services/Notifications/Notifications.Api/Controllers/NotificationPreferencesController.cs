using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Notifications.Application;

namespace Notifications.Api.Controllers;

/// <summary>
/// Which kinds of notification the caller has muted. Muting stops one being
/// created at all, so a muted type never appears in the inbox afterwards.
/// </summary>
[ApiController]
[Route("api/notification-preferences")]
[Authorize]
[Tags("Notifications")]
public sealed class NotificationPreferencesController(NotificationService notifications) : ControllerBase
{
    /// <summary>The caller's muted notification types.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<NotificationPreferencesDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<NotificationPreferencesDto>>> Get(
        CancellationToken cancellationToken)
    {
        var preferences = await notifications.GetPreferencesAsync(cancellationToken);

        return Ok(ApiResponse<NotificationPreferencesDto>.Ok(preferences));
    }

    /// <summary>Replaces the caller's muted list with the types supplied.</summary>
    /// <remarks>
    /// Send the complete list. Unknown type names are refused, with
    /// data.errors naming them.
    /// </remarks>
    [HttpPut]
    [ProducesResponseType(typeof(ApiResponse<NotificationPreferencesDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ApiResponse<NotificationPreferencesDto>>> Save(
        NotificationPreferencesDto request,
        CancellationToken cancellationToken)
    {
        var saved = await notifications.SavePreferencesAsync(request, cancellationToken);

        return Ok(ApiResponse<NotificationPreferencesDto>.Ok(saved, "Preferences saved."));
    }
}
