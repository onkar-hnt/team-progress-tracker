using Work.Domain;

namespace Work.Application.Rules;

/// <summary>Replaces Postgres ensure_daily_update_task (R1).</summary>
public sealed class DailyUpdateTaskEnsurer(IWorkStore store, ITeamDirectory teamDirectory)
{
    public async Task EnsureTaskLinkedAsync(DailyUpdate entry, CancellationToken cancellationToken)
    {
        if (entry.TaskId is not null || entry.DeletedAt is not null)
        {
            return;
        }

        var title = entry.TaskTitle.Trim();
        var existing = await store.FindMatchingTaskByTitleAsync(
            entry.DeveloperId,
            entry.ProjectId,
            title,
            cancellationToken);

        if (existing is not null)
        {
            entry.TaskId = existing.Id;
            return;
        }

        var mentorId = await teamDirectory.GetPrimaryMentorIdAsync(entry.DeveloperId, cancellationToken);

        var task = new WorkTask
        {
            Name = title,
            ProjectId = entry.ProjectId,
            DeveloperId = entry.DeveloperId,
            MentorId = mentorId,
            Status = entry.Status,
            CreatedDate = entry.EntryDate,
            Priority = entry.Priority,
            EstimatedHours = entry.EstimatedHours,
        };

        task.Code = await store.AllocateTaskCodeAsync(cancellationToken);
        store.AddTask(task);
        entry.TaskId = task.Id;
    }
}
