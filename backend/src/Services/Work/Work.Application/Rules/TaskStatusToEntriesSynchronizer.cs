using Work.Domain;

namespace Work.Application.Rules;

/// <summary>Replaces Postgres sync_daily_update_from_task (R4).</summary>
public sealed class TaskStatusToEntriesSynchronizer(IWorkStore store, WorkSyncContext syncContext)
{
    public async Task SyncAsync(WorkTask task, string? previousStatus, CancellationToken cancellationToken)
    {
        if (previousStatus is null || previousStatus == task.Status)
        {
            return;
        }

        var entries = await store.ListActiveEntriesForTaskAsync(task.Id, cancellationToken);

        syncContext.SuppressEntryToTaskStatusSync = true;
        syncContext.SuppressWorkBlockedNotification = true;

        try
        {
            foreach (var entry in entries)
            {
                if (entry.Status == task.Status)
                {
                    continue;
                }

                entry.Status = task.Status;
                entry.Progress = DomainRules.ProgressForStatus(task.Status) ?? entry.Progress;
                entry.IsBlocked = task.Status == DomainRules.TaskBlocked;
            }
        }
        finally
        {
            syncContext.SuppressEntryToTaskStatusSync = false;
            syncContext.SuppressWorkBlockedNotification = false;
        }
    }
}
