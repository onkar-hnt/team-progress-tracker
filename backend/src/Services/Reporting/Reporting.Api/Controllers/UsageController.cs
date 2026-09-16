using Common;
using Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Reporting.Application;

namespace Reporting.Api.Controllers;

/// <summary>
/// Database footprint and login counts for the admin Usage screen. Read-only
/// catalog queries; nothing here writes.
/// </summary>
[ApiController]
[Route("api/usage")]
[Authorize(Policy = AppPolicies.Admin)]
[Tags("Usage")]
public sealed class UsageController(UsageService usage) : ControllerBase
{
    /// <summary>Current database size, table breakdown and account counts.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<ResourceUsageDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ApiResponse<ResourceUsageDto>>> Get(CancellationToken cancellationToken)
    {
        var result = await usage.GetUsageAsync(cancellationToken);
        return Ok(ApiResponse<ResourceUsageDto>.Ok(result));
    }
}
