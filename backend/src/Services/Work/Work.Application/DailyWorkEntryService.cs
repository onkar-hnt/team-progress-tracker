using Work.Application.Rules;
using Work.Domain;

namespace Work.Application;

public sealed class DailyWorkEntryService(
    IWorkStore store,
    IAccessScopeProvider scopeProvider,
    ITeamDirectory teamDirectory,
    ICurrentUser currentUser,
    INotificationPublisher notifications,
    WorkSyncContext syncContext,
    DailyUpdateTaskEnsurer taskEnsurer,
    DailyUpdateTaskLinkApplier linkApplier,
    EntryStatusToTaskSynchronizer entryToTaskSync,
    TaskEffortSynchronizer effortSync)
{
    public async Task<IReadOnlyList<DailyWorkEntryDto>> ListAsync(
        DailyWorkQuery query,
        CancellationToken cancellationToken)
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

        var rows = await store.QueryDailyUpdatesAsync(restricted, scope, cancellationToken);

        return [.. rows.Select(WorkMapping.ToDto)];
    }

    public async Task<DailyWorkEntryDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var entry = await store.FindDailyUpdateAsync(id, cancellationToken)
            ?? throw new NotFoundException("That daily update is no longer available.");

        scope.RequireDeveloperVisible(entry.DeveloperId);

        return WorkMapping.ToDto(entry);
    }

    public async Task<DailyWorkEntryDto> CreateAsync(
        SaveDailyWorkEntryRequest request,
        CancellationToken cancellationToken)
    {
        await RequireOwnDeveloperOrAdminAsync(request.DeveloperId, cancellationToken);
        await ValidateReferencesAsync(request, JsonFieldSet.All, cancellationToken);

        var entry = WorkMapping.FromDailyRequest(request);

        await taskEnsurer.EnsureTaskLinkedAsync(entry, cancellationToken);
        store.AddDailyUpdate(entry);

        // The rules below read the task and the day's entries back through the
        // store, so the row and any task the ensurer created have to be in the
        // database before they run.
        await store.SaveChangesAsync(cancellationToken);

        await linkApplier.ApplyAsync(entry, null, entry.Status, statusChangedInRequest: true, cancellationToken);
        await entryToTaskSync.SyncAsync(entry, cancellationToken);
        await effortSync.RecomputeAsync(CollectTaskIds(entry, null), entry, cancellationToken);

        await store.SaveChangesAsync(cancellationToken);

        var composer = new WorkNotificationComposer(currentUser, teamDirectory);
        var pending = new List<NotificationRequest>();
        pending.AddRange(await composer.ForDailyUpdateCreatedAsync(entry, cancellationToken));

        if (entry.IsBlocked && !syncContext.SuppressWorkBlockedNotification)
        {
            pending.AddRange(await composer.ForWorkBlockedAsync(entry, cancellationToken));
        }

        await notifications.PublishAsync(pending, cancellationToken);

        return WorkMapping.ToDto(entry);
    }

    public async Task<DailyWorkEntryDto> UpdateAsync(
        Guid id,
        UpdatePayload<SaveDailyWorkEntryRequest> payload,
        CancellationToken cancellationToken)
    {
        var entry = await store.FindDailyUpdateAsync(id, cancellationToken)
            ?? throw new NotFoundException("That daily update is no longer available.");

        await RequireOwnDeveloperOrAdminAsync(entry.DeveloperId, cancellationToken);
        await ValidateReferencesAsync(payload.Request, payload.Fields, cancellationToken);

        var previousTaskId = entry.TaskId;
        var previousStatus = entry.Status;
        var previousBlocked = entry.IsBlocked;

        WorkMapping.ApplyDailyRequest(payload.Request, payload.Fields, entry);

        var statusChangedInRequest = payload.Fields.Has("status");

        await linkApplier.ApplyAsync(
            entry,
            previousTaskId,
            previousStatus,
            statusChangedInRequest,
            cancellationToken);
        await entryToTaskSync.SyncAsync(entry, cancellationToken);

        var taskIds = CollectTaskIds(entry, previousTaskId);

        // Effort totals are recomputed from the stored entries, so the edited
        // hours and any re-link have to land first.
        await store.SaveChangesAsync(cancellationToken);

        await effortSync.RecomputeAsync(taskIds, entry, cancellationToken);
        await store.SaveChangesAsync(cancellationToken);

        if (!previousBlocked && entry.IsBlocked && !syncContext.SuppressWorkBlockedNotification)
        {
            var blocked = await new WorkNotificationComposer(currentUser, teamDirectory)
                .ForWorkBlockedAsync(entry, cancellationToken);
            await notifications.PublishAsync(blocked, cancellationToken);
        }

        return WorkMapping.ToDto(entry);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var entry = await store.FindDailyUpdateAsync(id, cancellationToken)
            ?? throw new NotFoundException("That daily update is no longer available.");

        await RequireOwnDeveloperOrAdminAsync(entry.DeveloperId, cancellationToken);

        var previousTaskId = entry.TaskId;
        store.RemoveDailyUpdate(entry);
        await store.SaveChangesAsync(cancellationToken);

        if (previousTaskId is Guid taskId)
        {
            await effortSync.RecomputeAsync([taskId], null, cancellationToken);
            await store.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task RequireOwnDeveloperOrAdminAsync(Guid developerId, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (scope.IsAdmin)
        {
            return;
        }

        if (currentUser.DeveloperId == developerId)
        {
            return;
        }

        throw new ForbiddenException();
    }

    private async Task ValidateReferencesAsync(
        SaveDailyWorkEntryRequest request,
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
    }

    private static IReadOnlyCollection<Guid> CollectTaskIds(DailyUpdate entry, Guid? previousTaskId)
    {
        var ids = new List<Guid>();

        if (entry.TaskId is Guid taskId)
        {
            ids.Add(taskId);
        }

        if (previousTaskId is Guid oldId && oldId != entry.TaskId)
        {
            ids.Add(oldId);
        }

        return ids;
    }
}
