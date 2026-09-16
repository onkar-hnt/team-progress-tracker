using Work.Domain;

namespace Work.Application;

public sealed class WorkBusinessCodeRetry(IWorkStore store)
{
    public async Task AllocateAndAddTaskAsync(WorkTask task, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            task.Code = await store.AllocateTaskCodeAsync(cancellationToken);
            store.AddTask(task);

            try
            {
                await store.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (ConflictException exception) when (IsBusinessCodeConflict(exception))
            {
                store.DetachTask(task);

                if (attempt == 2)
                {
                    throw;
                }
            }
        }

        throw new ConflictException("Could not assign a unique task code. Try again.");
    }

    public async Task AllocateAndAddFeedbackAsync(Feedback comment, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            comment.Code = await store.AllocateCommentCodeAsync(cancellationToken);
            store.AddFeedback(comment);

            try
            {
                await store.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (ConflictException exception) when (IsBusinessCodeConflict(exception))
            {
                store.DetachFeedback(comment);

                if (attempt == 2)
                {
                    throw;
                }
            }
        }

        throw new ConflictException("Could not assign a unique comment code. Try again.");
    }

    private static bool IsBusinessCodeConflict(ConflictException exception) =>
        exception.Message.Contains("business code", StringComparison.OrdinalIgnoreCase);
}
