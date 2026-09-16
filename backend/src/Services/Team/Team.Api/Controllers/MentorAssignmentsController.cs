using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Team.Application;

namespace Team.Api.Controllers;

/// <summary>
/// Which mentor is accountable for which employee. The app reads this to work
/// out what a mentor is allowed to see.
/// </summary>
[ApiController]
[Route("api/mentor-assignments")]
[Authorize]
[Tags("Mentors")]
public sealed class MentorAssignmentsController(MentorAssignmentService assignments) : ControllerBase
{
    /// <summary>Lists the assignments the caller may see.</summary>
    /// <remarks>
    /// An administrator gets all of them, a mentor their own, a developer the
    /// ones naming them. Set them through PUT /api/mentors/{mentorId}/assignments.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<MentorAssignmentDto>>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<MentorAssignmentDto>>>> List(
        CancellationToken cancellationToken)
    {
        var result = await assignments.ListAsync(cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<MentorAssignmentDto>>.Ok(result));
    }
}
