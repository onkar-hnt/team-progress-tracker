using Work.Domain;

namespace Work.Application.Rules;

/// <summary>Replaces Postgres sync_task_from_daily_update (R3).</summary>
public sealed class EntryStatusToTaskSynchronizer(IWorkStore store, WorkSyncContext syncContext)
{
    public async Task SyncAsync(DailyUpdate entry, CancellationToken cancellationToken)
    {
        if (syncContext.SuppressEntryToTaskStatusSync || entry.DeletedAt is not null || entry.TaskId is not Guid taskId)
        {
            return;
        }

        var task = await store.FindTaskAsync(taskId, cancellationToken);

        if (task is null || task.Status == entry.Status)
        {
            return;
        }

        task.Status = entry.Status;
    }
}
