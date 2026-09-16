using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Work.Application;

namespace Work.Api.Controllers;

/// <summary>
/// The comment trail on a task: a mentor's feedback, the developer's reply,
/// the mentor's answer to that, and so on in order. Nothing is overwritten, so
/// the whole conversation stays readable by both sides.
/// <para>
/// Feedback is allowed on any task the caller can see, not only tasks a mentor
/// assigned. A developer may comment on their own task; a mentor on the tasks
/// of employees they are accountable for.
/// </para>
/// </summary>
[ApiController]
[Route("api/feedback")]
[Authorize]
[Tags("Feedback")]
public sealed class FeedbackController(CommentService comments) : ControllerBase
{
    /// <summary>Lists comments the caller may see, oldest first per task.</summary>
    /// <remarks>
    /// Filter by taskIds to fetch one task's trail. All filters are optional
    /// and the id filters take comma-separated lists.
    /// </remarks>
    /// <param name="developerIds">Comma-separated employee ids.</param>
    /// <param name="mentorIds">Comma-separated mentor ids.</param>
    /// <param name="projectIds">Comma-separated project ids.</param>
    /// <param name="taskIds">Comma-separated task ids — the usual way to read one trail.</param>
    /// <param name="dateFrom">Earliest comment date (yyyy-MM-dd).</param>
    /// <param name="dateTo">Latest comment date (yyyy-MM-dd).</param>
    /// <param name="limit">How many to return at most.</param>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<MentorCommentDto>>>> List(
        [FromQuery] string? developerIds,
        [FromQuery] string? mentorIds,
        [FromQuery] string? projectIds,
        [FromQuery] string? taskIds,
        [FromQuery] string? dateFrom,
        [FromQuery] string? dateTo,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        var query = new CommentQuery
        {
            DeveloperIds = QueryBinding.Guids(developerIds),
            MentorIds = QueryBinding.Guids(mentorIds),
            ProjectIds = QueryBinding.Guids(projectIds),
            TaskIds = QueryBinding.Guids(taskIds),
            DateFrom = dateFrom,
            DateTo = dateTo,
            Limit = limit,
        };

        var result = await comments.ListAsync(query, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<MentorCommentDto>>.Ok(result));
    }

    /// <summary>Adds a comment to a task's trail.</summary>
    /// <remarks>
    /// The author is taken from the token, never from the request. Posting
    /// notifies the other side unless they have muted that type, and nobody is
    /// notified of their own comment.
    /// </remarks>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<MentorCommentDto>), StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<MentorCommentDto>>> Create(
        SaveCommentRequest request,
        CancellationToken cancellationToken)
    {
        var result = await comments.CreateAsync(request, cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<MentorCommentDto>.Created(result, "Comment added."));
    }

    /// <summary>Edits a comment. Only its author may.</summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<MentorCommentDto>>> Update(
        Guid id,
        UpdatePayload<SaveCommentRequest> payload,
        CancellationToken cancellationToken)
    {
        var result = await comments.UpdateAsync(id, payload, cancellationToken);

        return Ok(ApiResponse<MentorCommentDto>.Ok(result, "Comment saved."));
    }

    /// <summary>Moves a comment to Recently deleted. Only its author may.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse>> Delete(Guid id, CancellationToken cancellationToken)
    {
        await comments.DeleteAsync(id, cancellationToken);

        return Ok(ApiResponse.Ok("Comment moved to Recently deleted."));
    }
}
