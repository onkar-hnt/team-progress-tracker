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
