using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Team.Application;

namespace Team.Api.Controllers;

/// <summary>
/// Mentors, and which employees each of them is accountable for. Who a mentor
/// is assigned to decides what they can see everywhere else in the app.
/// </summary>
[ApiController]
[Route("api/mentors")]
[Authorize]
[Tags("Mentors")]
public sealed class MentorsController(MentorService mentors, MentorAssignmentService assignments) : ControllerBase
{
    /// <summary>Lists mentors the caller may see.</summary>
    /// <remarks>
    /// An administrator or mentor gets all of them; a developer gets the
    /// mentors they are actively assigned to.
    /// </remarks>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<MentorDto>>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<MentorDto>>>> List(
        CancellationToken cancellationToken)
    {
        var result = await mentors.ListAsync(cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<MentorDto>>.Ok(result));
    }

    /// <summary>Adds a mentor and assigns their MEN code.</summary>
    /// <response code="409">That email address already belongs to a mentor.</response>
    [HttpPost]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse<MentorDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ApiResponse<MentorDto>>> Create(
        SaveMentorRequest request,
        CancellationToken cancellationToken)
    {
        var result = await mentors.CreateAsync(request, cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<MentorDto>.Created(result, "Mentor added."));
    }

    /// <summary>Updates only the fields present in the request body.</summary>
    [HttpPut("{id:guid}")]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse<MentorDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<MentorDto>>> Update(
        Guid id,
        UpdatePayload<SaveMentorRequest> payload,
        CancellationToken cancellationToken)
    {
        var result = await mentors.UpdateAsync(id, payload, cancellationToken);

        return Ok(ApiResponse<MentorDto>.Ok(result, "Mentor saved."));
    }

    /// <summary>Moves a mentor to Recently deleted.</summary>
    /// <remarks>Refused while comments they wrote are still live.</remarks>
    /// <response code="409">Live feedback still depends on this mentor.</response>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = AppPolicies.Privileged)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ApiResponse>> Delete(Guid id, CancellationToken cancellationToken)
    {
        await mentors.DeleteAsync(id, cancellationToken);

        return Ok(ApiResponse.Ok("Mentor moved to Recently deleted."));
    }

    /// <summary>Replaces the list of employees a mentor is accountable for.</summary>
    /// <remarks>
    /// Send the complete list: pairs left out are removed, pairs already there
    /// are reactivated rather than duplicated. An administrator may set any
    /// mentor's list; a mentor may only set their own.
    /// </remarks>
    [HttpPut("{mentorId:guid}/assignments")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<MentorAssignmentDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<MentorAssignmentDto>>>> SetAssignments(
        Guid mentorId,
        SetMentorAssignmentsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await assignments.SetForMentorAsync(mentorId, request, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<MentorAssignmentDto>>.Ok(result, "Assignments updated."));
    }
}
