using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Work.Application;

namespace Work.Api.Controllers;

/// <summary>
/// Tasks, whoever created them. A mentor can assign one; a developer can add
/// their own, and both kinds behave the same everywhere afterwards — including
/// being open to feedback.
/// <para>
/// Status is kept in step with the daily updates underneath a task in both
/// directions, so marking a task done closes its open updates and the last
/// update's status moves the task.
/// </para>
/// </summary>
[ApiController]
[Route("api/tasks")]
[Authorize]
[Tags("Tasks")]
public sealed class TasksController(TaskService tasks) : ControllerBase
{
    /// <summary>Lists tasks the caller may see, filtered by the query.</summary>
    /// <remarks>
    /// Every filter is optional, and the id filters take a comma-separated
    /// list. Filters only ever narrow what the caller's role already allows:
    /// asking for somebody else's tasks returns nothing rather than 403.
    /// </remarks>
    /// <param name="developerIds">Comma-separated employee ids.</param>
    /// <param name="mentorIds">Comma-separated ids of the assigning mentors.</param>
    /// <param name="projectIds">Comma-separated project ids.</param>
    /// <param name="statuses">Comma-separated statuses, such as in-progress,completed.</param>
    /// <param name="priorities">Comma-separated priorities, such as high,critical.</param>
    /// <param name="dueOnOrBefore">Only tasks due on or before this date (yyyy-MM-dd).</param>
    /// <param name="limit">How many to return at most.</param>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<AssignedTaskDto>>>> List(
        [FromQuery] string? developerIds,
        [FromQuery] string? mentorIds,
        [FromQuery] string? projectIds,
        [FromQuery] string? statuses,
        [FromQuery] string? priorities,
        [FromQuery] string? dueOnOrBefore,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        var query = new TaskQuery
        {
            DeveloperIds = QueryBinding.Guids(developerIds),
            MentorIds = QueryBinding.Guids(mentorIds),
            ProjectIds = QueryBinding.Guids(projectIds),
            Statuses = QueryBinding.Strings(statuses),
            Priorities = QueryBinding.Strings(priorities),
            DueOnOrBefore = dueOnOrBefore,
            Limit = limit,
        };

        var result = await tasks.ListAsync(query, cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<AssignedTaskDto>>.Ok(result));
    }

    /// <summary>One task, if the caller may see it.</summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<AssignedTaskDto>>> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await tasks.GetAsync(id, cancellationToken);

        return Ok(ApiResponse<AssignedTaskDto>.Ok(result));
    }

    /// <summary>Adds a task and assigns its TSK code.</summary>
    /// <remarks>
    /// A mentor assigns work to an employee they are accountable for; a
    /// developer may only add their own. Omitting the estimate leaves the
    /// comparison against actual hours empty rather than assuming a figure.
    /// </remarks>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<AssignedTaskDto>), StatusCodes.Status201Created)]
    public async Task<ActionResult<ApiResponse<AssignedTaskDto>>> Create(
        SaveTaskRequest request,
        CancellationToken cancellationToken)
    {
        var result = await tasks.CreateAsync(request, cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<AssignedTaskDto>.Created(result, "Task added."));
    }

    /// <summary>Updates a task.</summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<AssignedTaskDto>>> Update(
        Guid id,
        UpdatePayload<SaveTaskRequest> payload,
        CancellationToken cancellationToken)
    {
        var result = await tasks.UpdateAsync(id, payload, cancellationToken);

        return Ok(ApiResponse<AssignedTaskDto>.Ok(result, "Task saved."));
    }

    /// <summary>Moves a task's status without touching anything else.</summary>
    /// <remarks>
    /// What the board uses. Completing a task also completes the daily updates
    /// still open underneath it.
    /// </remarks>
    [HttpPatch("{id:guid}/status")]
    public async Task<ActionResult<ApiResponse<AssignedTaskDto>>> SetStatus(
        Guid id,
        SetTaskStatusRequest request,
        CancellationToken cancellationToken)
    {
        var result = await tasks.SetStatusAsync(id, request, cancellationToken);

        return Ok(ApiResponse<AssignedTaskDto>.Ok(result, "Task status updated."));
    }

    /// <summary>Moves a task to Recently deleted.</summary>
    /// <remarks>
    /// Restorable for fifteen days, after which it is destroyed. Refused while
    /// live daily updates or comments still belong to it.
    /// </remarks>
    /// <response code="409">Live updates or comments still depend on this task.</response>
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse>> Delete(Guid id, CancellationToken cancellationToken)
    {
        await tasks.DeleteAsync(id, cancellationToken);

        return Ok(ApiResponse.Ok("Task moved to Recently deleted."));
    }
}
