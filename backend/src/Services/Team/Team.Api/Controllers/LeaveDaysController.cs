using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Team.Application;

namespace Team.Api.Controllers;

/// <summary>
/// Days a developer was on leave, and so owes no daily update.
/// </summary>
/// <remarks>
/// Writing is narrower than reading. A developer accounts for their own days
/// and an administrator for anybody's; a mentor may read a leave day but not
/// record one, because marking somebody as having been away is a statement
/// about them. A mentor who believes a day was leave asks for an update
/// instead.
/// </remarks>
[ApiController]
[Route("api/leave-days")]
[Authorize]
[Tags("Leave")]
public sealed class LeaveDaysController(LeaveService leave) : ControllerBase
{
    /// <summary>Lists the leave days the caller may see.</summary>
    /// <remarks>
    /// Own days, every day for an administrator, and the assigned employees for
    /// a mentor. A leave day names no project, so unlike work it is not
    /// narrowed by the projects a mentor is responsible for.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<LeaveDayDto>>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<LeaveDayDto>>>> List(
        [FromQuery] LeaveDayQuery query,
        CancellationToken cancellationToken)
    {
        var result = await leave.ListAsync(query, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<LeaveDayDto>>.Ok(result));
    }

    /// <summary>Accounts for one day as leave.</summary>
    /// <remarks>
    /// One row per developer per date, so the caller can mark without reading
    /// first and treat a conflict as "already said". Dates beyond tomorrow are
    /// refused: tomorrow rather than today, because the browser works in the
    /// reader's own calendar day and the server counts in UTC.
    /// </remarks>
    /// <response code="409">That day is already accounted for.</response>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<LeaveDayDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ApiResponse<LeaveDayDto>>> Create(
        SaveLeaveDayRequest request,
        CancellationToken cancellationToken)
    {
        var result = await leave.CreateAsync(request, cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<LeaveDayDto>.Created(result, "Day marked as leave."));
    }

    /// <summary>Clears a leave day.</summary>
    /// <remarks>
    /// Destroys the row rather than moving it to Recently deleted. There is no
    /// update either: changing which day or whose it was is a different
    /// statement, made by removing this one and marking the right day.
    /// </remarks>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ApiResponse>> Delete(Guid id, CancellationToken cancellationToken)
    {
        await leave.DeleteAsync(id, cancellationToken);

        return Ok(ApiResponse.Ok("Leave day cleared."));
    }
}
