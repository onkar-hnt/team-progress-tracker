using Work.Application.Rules;
using Work.Domain;

namespace Work.Application;

public sealed class TaskService(
    IWorkStore store,
    IAccessScopeProvider scopeProvider,
    ITeamDirectory teamDirectory,
    ICurrentUser currentUser,
    INotificationPublisher notifications,
    TaskStatusToEntriesSynchronizer taskToEntriesSync,
    WorkBusinessCodeRetry codeRetry)
{
    public async Task<IReadOnlyList<AssignedTaskDto>> ListAsync(TaskQuery query, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (scope.RestrictDeveloperIds(query.DeveloperIds) is { Count: 0 })
        {
            return [];
        }

        var restricted = query with
        {
            DeveloperIds = scope.RestrictDeveloperIds(query.DeveloperIds),
        };

        var rows = await store.QueryTasksAsync(restricted, scope, cancellationToken);

        return [.. rows.Select(WorkMapping.ToDto)];
    }

    public async Task<AssignedTaskDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var task = await store.FindTaskAsync(id, cancellationToken)
            ?? throw new NotFoundException("That task is no longer available.");

        if (!CanViewTask(scope, task))
        {
            throw new NotFoundException("That task is no longer available.");
        }

        return WorkMapping.ToDto(task);
    }

    public async Task<AssignedTaskDto> CreateAsync(SaveTaskRequest request, CancellationToken cancellationToken)
    {
        await RequireTaskWriteAsync(request.DeveloperId, cancellationToken);
        await ValidateReferencesAsync(request, JsonFieldSet.All, cancellationToken);

        var task = new WorkTask();
        WorkMapping.ApplyTaskRequest(request, task);

        if (string.IsNullOrWhiteSpace(request.Code))
        {
            await codeRetry.AllocateAndAddTaskAsync(task, cancellationToken);
        }
        else
        {
            task.Code = request.Code.Trim();
            store.AddTask(task);
            await store.SaveChangesAsync(cancellationToken);
        }

        var createdNotifications = await new WorkNotificationComposer(currentUser, teamDirectory)
            .ForTaskCreatedAsync(task, cancellationToken);
        await notifications.PublishAsync(createdNotifications, cancellationToken);

        return WorkMapping.ToDto(task);
    }

    public async Task<AssignedTaskDto> UpdateAsync(
        Guid id,
        UpdatePayload<SaveTaskRequest> payload,
        CancellationToken cancellationToken)
    {
        var task = await store.FindTaskAsync(id, cancellationToken)
            ?? throw new NotFoundException("That task is no longer available.");

        await RequireTaskWriteAsync(task.DeveloperId, cancellationToken);
        await ValidateReferencesAsync(payload.Request, payload.Fields, cancellationToken);

        var previousDeveloperId = task.DeveloperId;
        var previousStatus = task.Status;

        WorkMapping.ApplyTaskRequest(payload.Request, payload.Fields, task);

        await taskToEntriesSync.SyncAsync(task, previousStatus, cancellationToken);
        await store.SaveChangesAsync(cancellationToken);

        var composer = new WorkNotificationComposer(currentUser, teamDirectory);
        var pending = new List<NotificationRequest>();

        if (previousDeveloperId != task.DeveloperId)
        {
            pending.AddRange(await composer.ForTaskReassignedAsync(task, cancellationToken));
        }

        if (previousStatus != task.Status)
        {
            pending.AddRange(await composer.ForTaskStatusChangedAsync(task, previousStatus, task.Status, cancellationToken));
        }

        await notifications.PublishAsync(pending, cancellationToken);

        return WorkMapping.ToDto(task);
    }

    public async Task<AssignedTaskDto> SetStatusAsync(
        Guid id,
        SetTaskStatusRequest request,
        CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var task = await store.FindTaskAsync(id, cancellationToken)
            ?? throw new NotFoundException("That task is no longer available.");

        if (!CanChangeStatus(scope, task))
        {
            throw new ForbiddenException();
        }

        var previousStatus = task.Status;
        task.Status = request.Status;

        await taskToEntriesSync.SyncAsync(task, previousStatus, cancellationToken);
        await store.SaveChangesAsync(cancellationToken);

        if (previousStatus != task.Status)
        {
            var pending = await new WorkNotificationComposer(currentUser, teamDirectory)
                .ForTaskStatusChangedAsync(task, previousStatus, task.Status, cancellationToken);
            await notifications.PublishAsync(pending, cancellationToken);
        }

        return WorkMapping.ToDto(task);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var task = await store.FindTaskAsync(id, cancellationToken)
            ?? throw new NotFoundException("That task is no longer available.");

        await RequireTaskWriteAsync(task.DeveloperId, cancellationToken);
        store.RemoveTask(task);
        await store.SaveChangesAsync(cancellationToken);
    }

    private async Task RequireTaskWriteAsync(Guid developerId, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (scope.IsAdmin)
        {
            return;
        }

        if (scope.IsMentor && scope.CanViewDeveloper(developerId))
        {
            return;
        }

        throw new ForbiddenException("Developers cannot edit tasks directly. Update them through daily work.");
    }

    private static bool CanViewTask(AccessScope scope, WorkTask task) =>
        scope.CanViewDeveloper(task.DeveloperId)
        || (scope.MentorId is Guid mentorId && task.MentorId == mentorId);

    private static bool CanChangeStatus(AccessScope scope, WorkTask task)
    {
        if (scope.IsAdmin)
        {
            return true;
        }

        if (scope.IsMentor && scope.CanViewDeveloper(task.DeveloperId))
        {
            return true;
        }

        return scope.DeveloperId == task.DeveloperId;
    }

    private async Task ValidateReferencesAsync(
        SaveTaskRequest request,
        JsonFieldSet fields,
        CancellationToken cancellationToken)
    {
        if (fields.Has("developerId")
            && !await teamDirectory.DeveloperExistsAsync(request.DeveloperId, cancellationToken))
        {
            throw new ValidationFailedException("Choose an employee that exists.");
        }

        if (fields.Has("projectId")
            && !await teamDirectory.ProjectExistsAsync(request.ProjectId, cancellationToken))
        {
            throw new ValidationFailedException("Choose a project that exists.");
        }

        if (fields.Has("mentorId")
            && request.MentorId is Guid mentorId
            && !await teamDirectory.MentorExistsAsync(mentorId, cancellationToken))
        {
            throw new ValidationFailedException("Choose a mentor that exists.");
        }
    }
}
