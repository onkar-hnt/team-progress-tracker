using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Work.Application;

namespace Work.Api.Controllers;

/// <summary>
/// Who changed what, field by field, with the value before and after. Entries
/// are removed fifteen days after they are written, which is what the app's
/// Activity view shows.
/// </summary>
[ApiController]
[Route("api/change-log")]
[Authorize]
[Tags("Activity")]
public sealed class ChangeLogController(ChangeLogService changeLog) : ControllerBase
{
    /// <summary>The most recent changes the caller may see.</summary>
    /// <param name="limit">How many to return. Defaults to 100.</param>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ChangeRecordDto>>>> List(
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default)
    {
        var result = await changeLog.ListAsync(limit, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<ChangeRecordDto>>.Ok(result));
    }

    /// <summary>The history of one record.</summary>
    /// <param name="kind">daily_updates, developers, feedback, mentors, projects or tasks.</param>
    /// <param name="recordId">The record's id.</param>
    [HttpGet("{kind}/{recordId:guid}")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ChangeRecordDto>>>> ForRecord(
        string kind,
        Guid recordId,
        CancellationToken cancellationToken)
    {
        var result = await changeLog.ForRecordAsync(kind, recordId, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<ChangeRecordDto>>.Ok(result));
    }
}
