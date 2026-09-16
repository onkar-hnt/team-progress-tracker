using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Work.Application;

namespace Work.Api.Controllers;

/// <summary>
/// What each person did on a given day. An update names a task; if the task
/// title sent does not match an existing task, one is created and linked
/// rather than leaving the day's work unattached.
/// <para>
/// The estimate on an update feeds the task's effort figures: days worked and
/// actual hours, counting a standard eight-hour day where nobody typed hours.
/// </para>
/// </summary>
[ApiController]
[Route("api/daily-updates")]
[Authorize]
[Tags("Daily updates")]
public sealed class DailyUpdatesController(DailyWorkEntryService entries) : ControllerBase
{
    /// <summary>Lists daily updates the caller may see, newest first.</summary>
    /// <param name="dateFrom">Earliest work date (yyyy-MM-dd).</param>
    /// <param name="dateTo">Latest work date (yyyy-MM-dd).</param>
    /// <param name="developerIds">Comma-separated employee ids.</param>
    /// <param name="projectIds">Comma-separated project ids.</param>
    /// <param name="statuses">Comma-separated statuses.</param>
    /// <param name="priorities">Comma-separated priorities.</param>
    /// <param name="isBlocked">Only blocked, or only unblocked, work.</param>
    /// <param name="limit">How many to return at most.</param>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DailyWorkEntryDto>>>> List(
        [FromQuery] string? dateFrom,
        [FromQuery] string? dateTo,
        [FromQuery] string? developerIds,
        [FromQuery] string? projectIds,
        [FromQuery] string? statuses,
        [FromQuery] string? priorities,
        [FromQuery] bool? isBlocked,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        var query = new DailyWorkQuery
        {
            DateFrom = dateFrom,
            DateTo = dateTo,
            DeveloperIds = QueryBinding.Guids(developerIds),
            ProjectIds = QueryBinding.Guids(projectIds),
            Statuses = QueryBinding.Strings(statuses),
            Priorities = QueryBinding.Strings(priorities),
            IsBlocked = isBlocked,
            Limit = limit,
        };

        var result = await entries.ListAsync(query, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<DailyWorkEntryDto>>.Ok(result));
    }

    /// <summary>One daily update, if the caller may see it.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<DailyWorkEntryDto>>> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await entries.GetAsync(id, cancellationToken);

        return Ok(ApiResponse<DailyWorkEntryDto>.Ok(result));
    }

    /// <summary>Records a day's work and assigns its UPD code.</summary>
    /// <remarks>
    /// A developer may only record their own. Sending a task title that does
    /// not exist yet creates that task and links this update to it.
    /// </remarks>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<DailyWorkEntryDto>), StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<DailyWorkEntryDto>>> Create(
        SaveDailyWorkEntryRequest request,
        CancellationToken cancellationToken)
    {
        var result = await entries.CreateAsync(request, cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<DailyWorkEntryDto>.Created(result, "Daily update added."));
    }

    /// <summary>Updates a day's work.</summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<DailyWorkEntryDto>>> Update(
        Guid id,
        UpdatePayload<SaveDailyWorkEntryRequest> payload,
        CancellationToken cancellationToken)
    {
        var result = await entries.UpdateAsync(id, payload, cancellationToken);

        return Ok(ApiResponse<DailyWorkEntryDto>.Ok(result, "Daily update saved."));
    }

    /// <summary>Moves a daily update to Recently deleted.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse>> Delete(Guid id, CancellationToken cancellationToken)
    {
        await entries.DeleteAsync(id, cancellationToken);

        return Ok(ApiResponse.Ok("Daily update moved to Recently deleted."));
    }
}
