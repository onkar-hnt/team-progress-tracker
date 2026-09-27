using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Reporting.Application;

namespace Reporting.Api.Controllers;

/// <summary>
/// Totals over a period, aggregated in the database rather than by shipping
/// every work entry to the browser.
/// <para>
/// Hours logged counts a day of work, not a sum of typed numbers: for each
/// employee and date, the hours reported that day if anybody reported any,
/// otherwise a standard eight-hour day.
/// </para>
/// </summary>
[ApiController]
[Route("api/reports")]
[Authorize]
[Tags("Reports")]
public sealed class ReportsController(ReportService reports) : ControllerBase
{
    /// <summary>Totals for the whole team over a period.</summary>
    /// <remarks>
    /// Covers the employees the caller may see, broken down by employee and by
    /// project. Defaults to the current month. A range longer than a year is
    /// refused.
    /// </remarks>
    [HttpGet("team")]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse<TeamReportDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ApiResponse<TeamReportDto>>> Team(
        [FromQuery] ScopedReportQuery query,
        CancellationToken cancellationToken)
    {
        var report = await reports.GetTeamReportAsync(
            query.From,
            query.To,
            query.ProjectId,
            cancellationToken);

        return Ok(ApiResponse<TeamReportDto>.Ok(report));
    }

    /// <summary>Totals for one employee over a period.</summary>
    /// <remarks>
    /// A developer may ask for their own; an administrator or mentor for
    /// anybody they can see. Anyone else gets 403.
    /// </remarks>
    [HttpGet("developers/{developerId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<DeveloperTotalsDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ApiResponse<DeveloperTotalsDto>>> Developer(
        Guid developerId,
        [FromQuery] ScopedReportQuery query,
        CancellationToken cancellationToken)
    {
        var report = await reports.GetDeveloperReportAsync(
            developerId,
            query.From,
            query.To,
            query.ProjectId,
            cancellationToken);

        return Ok(ApiResponse<DeveloperTotalsDto>.Ok(report));
    }

    /// <summary>Which working days each visible employee has accounted for.</summary>
    /// <remarks>
    /// A day is answered by a daily update or by a leave day; anything else is
    /// a gap. Only working days are asked about, and only of people who owe an
    /// update, so administrators and mentors do not appear.
    /// <para>
    /// Not restricted to privileged callers: a developer asks this for their
    /// own days behind on the daily update screen. Defaults to the last
    /// fortnight rather than the calendar month, because month-to-date would
    /// ask about nothing on the first.
    /// </para>
    /// </remarks>
    /// <param name="developerIds">Comma-separated employee ids.</param>
    [HttpGet("update-coverage")]
    [ProducesResponseType(typeof(ApiResponse<UpdateCoverageDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<UpdateCoverageDto>>> UpdateCoverage(
        [FromQuery] ReportDateRangeQuery query,
        [FromQuery] string? developerIds,
        CancellationToken cancellationToken)
    {
        var report = await reports.GetUpdateCoverageAsync(
            query.From,
            query.To,
            QueryBinding.Guids(developerIds),
            cancellationToken);

        return Ok(ApiResponse<UpdateCoverageDto>.Ok(report));
    }

    /// <summary>Totals per project over a period.</summary>
    [HttpGet("projects")]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectTotalsDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ProjectTotalsDto>>>> Projects(
        [FromQuery] ReportDateRangeQuery query,
        CancellationToken cancellationToken)
    {
        var rows = await reports.GetProjectReportsAsync(query.From, query.To, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<ProjectTotalsDto>>.Ok(rows));
    }
}
