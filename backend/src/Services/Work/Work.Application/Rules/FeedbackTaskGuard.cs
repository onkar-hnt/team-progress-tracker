using Work.Domain;

namespace Work.Application.Rules;

/// <summary>Replaces Postgres guard_feedback_task (R7).</summary>
public sealed class FeedbackTaskGuard(IWorkStore store)
{
    public async Task GuardAsync(Feedback comment, CancellationToken cancellationToken)
    {
        if (comment.TaskId is not Guid taskId)
        {
            return;
        }

        var task = await store.FindTaskAsync(taskId, cancellationToken)
            ?? throw new ValidationFailedException("Choose a task that exists.");

        if (task.DeveloperId != comment.DeveloperId)
        {
            throw new ValidationFailedException("That task belongs to another developer.");
        }
    }
}
