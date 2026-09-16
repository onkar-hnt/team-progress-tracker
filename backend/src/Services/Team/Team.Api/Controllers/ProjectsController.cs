using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Team.Application;

namespace Team.Api.Controllers;

/// <summary>
/// Projects, their accountable mentor and the employees assigned to them.
/// </summary>
[ApiController]
[Route("api/projects")]
[Authorize]
[Tags("Projects")]
public sealed class ProjectsController(ProjectService projects) : ControllerBase
{
    /// <summary>Lists projects the caller may see, with their member ids.</summary>
    /// <remarks>
    /// An administrator or mentor gets all of them; a developer gets the
    /// projects they are a member of, or that their mentor is accountable for.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectDto>>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ProjectDto>>>> List(
        CancellationToken cancellationToken)
    {
        var result = await projects.ListAsync(cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<ProjectDto>>.Ok(result));
    }

    /// <summary>Adds a project, assigns its PRJ code and sets its members.</summary>
    [HttpPost]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse<ProjectDto>), StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<ProjectDto>>> Create(
        SaveProjectRequest request,
        CancellationToken cancellationToken)
    {
        var result = await projects.CreateAsync(request, cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<ProjectDto>.Created(result, "Project added."));
    }

    /// <summary>
    /// Updates only the fields present in the request body. Sending
    /// assignedDeveloperIds replaces the membership wholesale.
    /// </summary>
    [HttpPut("{id:guid}")]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse<ProjectDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<ProjectDto>>> Update(
        Guid id,
        UpdatePayload<SaveProjectRequest> payload,
        CancellationToken cancellationToken)
    {
        var result = await projects.UpdateAsync(id, payload, cancellationToken);

        return Ok(ApiResponse<ProjectDto>.Ok(result, "Project saved."));
    }

    /// <summary>Moves a project to Recently deleted.</summary>
    /// <remarks>Refused while live tasks or work entries belong to it.</remarks>
    /// <response code="409">Live work still depends on this project.</response>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ApiResponse>> Delete(Guid id, CancellationToken cancellationToken)
    {
        await projects.DeleteAsync(id, cancellationToken);

        return Ok(ApiResponse.Ok("Project moved to Recently deleted."));
    }
}
