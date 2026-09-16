using Work.Domain;

namespace Work.Application.Rules;

/// <summary>Replaces Postgres apply_daily_update_task_link (R2).</summary>
public sealed class DailyUpdateTaskLinkApplier(IWorkStore store)
{
    public async Task ApplyAsync(
        DailyUpdate entry,
        Guid? previousTaskId,
        string previousStatus,
        bool statusChangedInRequest,
        CancellationToken cancellationToken)
    {
        if (entry.TaskId is not Guid taskId)
        {
            return;
        }

        var task = await store.FindTaskAsync(taskId, cancellationToken)
            ?? throw new ValidationFailedException("Choose a task that exists.");

        if (task.DeveloperId != entry.DeveloperId)
        {
            throw new ValidationFailedException("That task belongs to another developer.");
        }

        var linkedNow = previousTaskId is null && entry.TaskId is not null;

        if (linkedNow && !statusChangedInRequest)
        {
            entry.Status = task.Status;
            entry.Progress = DomainRules.ProgressForStatus(task.Status) ?? entry.Progress;
            entry.IsBlocked = task.Status == DomainRules.TaskBlocked;
        }
    }
}
