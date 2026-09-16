using Common;
using Contracts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Team.Application;

namespace Team.Api.Controllers;

/// <summary>
/// The employee roster. An administrator or mentor manages it; everybody else
/// only ever reads the people they are allowed to see.
/// </summary>
[ApiController]
[Route("api/developers")]
[Authorize]
[Tags("Employees")]
public sealed class DevelopersController(DeveloperService developers) : ControllerBase
{
    /// <summary>Lists employees the caller may see, newest code first.</summary>
    /// <remarks>
    /// An administrator or mentor gets the whole roster; a developer gets only
    /// themselves. Employees in Recently deleted are never listed here.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<DeveloperDto>>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DeveloperDto>>>> List(
        CancellationToken cancellationToken)
    {
        var result = await developers.ListAsync(cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<DeveloperDto>>.Ok(result));
    }

    /// <summary>Adds an employee to the roster and assigns their DEV code.</summary>
    /// <response code="409">The email address or employee id is already in use.</response>
    [HttpPost]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse<DeveloperDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ApiResponse<DeveloperDto>>> Create(
        SaveDeveloperRequest request,
        CancellationToken cancellationToken)
    {
        var result = await developers.CreateAsync(request, cancellationToken);
        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<DeveloperDto>.Created(result, "Employee added."));
    }

    /// <summary>Updates only the fields present in the request body.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse<DeveloperDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<DeveloperDto>>> Update(
        Guid id,
        UpdatePayload<SaveDeveloperRequest> payload,
        CancellationToken cancellationToken)
    {
        var result = await developers.UpdateAsync(id, payload, cancellationToken);
        return Ok(ApiResponse<DeveloperDto>.Ok(result, "Employee saved."));
    }

    /// <summary>Moves an employee to Recently deleted.</summary>
    /// <remarks>
    /// Refused while live work still points at them (a task, a work entry, a
    /// comment, a mentor assignment or project membership) so nothing is
    /// orphaned. They are destroyed for good fifteen days after deletion
    /// unless somebody restores them first.
    /// </remarks>
    /// <response code="409">Live work still depends on this employee.</response>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ApiResponse>> Delete(Guid id, CancellationToken cancellationToken)
    {
        await developers.DeleteAsync(id, cancellationToken);
        return Ok(ApiResponse.Ok("Employee moved to Recently deleted."));
    }
}
