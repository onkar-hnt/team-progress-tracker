using Work.Domain;

namespace Work.Application.Rules;

/// <summary>Replaces Postgres sync_task_effort and task_reported_hours (R5).</summary>
public sealed class TaskEffortSynchronizer(IWorkStore store)
{
    public async Task RecomputeAsync(
        IReadOnlyCollection<Guid> taskIds,
        DailyUpdate? sourceEntry,
        CancellationToken cancellationToken)
    {
        foreach (var taskId in taskIds.Distinct())
        {
            if (taskId == Guid.Empty)
            {
                continue;
            }

            var task = await store.FindTaskAsync(taskId, cancellationToken);

            if (task is null)
            {
                continue;
            }

            var entries = await store.ListActiveEntriesForTaskAsync(taskId, cancellationToken);

            task.WorkedDays = entries
                .Select(entry => entry.EntryDate)
                .Distinct()
                .Count();

            task.ActualHours = entries
                .GroupBy(entry => entry.EntryDate)
                .Sum(group =>
                {
                    var withHours = group.Where(entry => entry.HoursSpent is not null).ToList();

                    return withHours.Count > 0
                        ? withHours.Sum(entry => entry.HoursSpent!.Value)
                        : DomainRules.StandardWorkingHours;
                });

            if (sourceEntry?.EstimatedHours is decimal estimate && sourceEntry.TaskId == taskId)
            {
                task.EstimatedHours = estimate;
            }
        }
    }
}
