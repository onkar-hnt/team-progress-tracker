using Work.Domain;

namespace Work.Application;

public sealed class RecycleBinService(
    IWorkStore store,
    IAccessScopeProvider scopeProvider,
    ICurrentUser currentUser,
    IRecycleBinGateway teamBin)
{
    public async Task<IReadOnlyList<DeletedRecordDto>> ListAsync(CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var results = new List<DeletedRecordDto>();

        foreach (var task in await store.ListDeletedTasksAsync(cancellationToken))
        {
            if (CanSeeDeletedTask(scope, task))
            {
                results.Add(new DeletedRecordDto
                {
                    Kind = "task",
                    Id = task.Id,
                    Title = task.Name,
                    DeletedAt = DateStrings.From(task.DeletedAt!.Value),
                    DeletedBy = task.DeletedBy,
                    Date = DateStrings.From(task.CreatedDate),
                    DeveloperId = task.DeveloperId,
                    ProjectId = task.ProjectId,
                });
            }
        }

        foreach (var entry in await store.ListDeletedEntriesAsync(cancellationToken))
        {
            if (CanSeeDeletedEntry(scope, entry))
            {
                results.Add(new DeletedRecordDto
                {
                    Kind = "entry",
                    Id = entry.Id,
                    Title = entry.TaskTitle,
                    DeletedAt = DateStrings.From(entry.DeletedAt!.Value),
                    DeletedBy = entry.DeletedBy,
                    Date = DateStrings.From(entry.EntryDate),
                    DeveloperId = entry.DeveloperId,
                    ProjectId = entry.ProjectId,
                });
            }
        }

        foreach (var comment in await store.ListDeletedFeedbackAsync(cancellationToken))
        {
            if (CanSeeDeletedFeedback(scope, comment))
            {
                results.Add(new DeletedRecordDto
                {
                    Kind = "feedback",
                    Id = comment.Id,
                    Title = comment.Comment.Length <= 120 ? comment.Comment : comment.Comment[..120],
                    DeletedAt = DateStrings.From(comment.DeletedAt!.Value),
                    DeletedBy = comment.DeletedBy,
                    Date = DateStrings.From(comment.FeedbackDate),
                    DeveloperId = comment.DeveloperId,
                    ProjectId = comment.ProjectId,
                    AuthorMentorId = comment.MentorId,
                });
            }
        }

        if (scope.IsPrivileged)
        {
            results.AddRange(await teamBin.ListTeamDeletedAsync(cancellationToken));
        }

        return [.. results.OrderByDescending(row => row.DeletedAt)];
    }

    public async Task RestoreAsync(string kind, Guid id, CancellationToken cancellationToken)
    {
        await RequireActionAsync(kind, id, cancellationToken);

        switch (kind)
        {
            case "task":
                await RestoreWorkRowAsync(
                    await store.FindTaskIncludingDeletedAsync(id, cancellationToken),
                    cancellationToken);
                break;
            case "entry":
                await RestoreWorkRowAsync(
                    await store.FindDailyUpdateIncludingDeletedAsync(id, cancellationToken),
                    cancellationToken);
                break;
            case "feedback":
                await RestoreWorkRowAsync(
                    await store.FindFeedbackIncludingDeletedAsync(id, cancellationToken),
                    cancellationToken);
                break;
            case "employee":
            case "mentor":
            case "project":
                await teamBin.RestoreTeamRowAsync(kind, id, cancellationToken);
                break;
            default:
                throw new ValidationFailedException("That record kind is not recognised.");
        }
    }

    public async Task DestroyAsync(string kind, Guid id, CancellationToken cancellationToken)
    {
        await RequireActionAsync(kind, id, cancellationToken);

        switch (kind)
        {
            case "task":
                await DestroyWorkRowAsync(
                    await store.FindTaskIncludingDeletedAsync(id, cancellationToken),
                    () => store.HardDeleteTaskAsync(id, cancellationToken));
                break;
            case "entry":
                await DestroyWorkRowAsync(
                    await store.FindDailyUpdateIncludingDeletedAsync(id, cancellationToken),
                    () => store.HardDeleteDailyUpdateAsync(id, cancellationToken));
                break;
            case "feedback":
                await DestroyWorkRowAsync(
                    await store.FindFeedbackIncludingDeletedAsync(id, cancellationToken),
                    () => store.HardDeleteFeedbackAsync(id, cancellationToken));
                break;
            case "employee":
            case "mentor":
            case "project":
                await teamBin.DestroyTeamRowAsync(kind, id, cancellationToken);
                break;
            default:
                throw new ValidationFailedException("That record kind is not recognised.");
        }
    }

    private async Task RequireActionAsync(string kind, Guid id, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (scope.IsAdmin)
        {
            return;
        }

        switch (kind)
        {
            case "entry":
                var entry = await store.FindDailyUpdateIncludingDeletedAsync(id, cancellationToken);
                if (entry?.DeletedAt is not null && currentUser.DeveloperId == entry.DeveloperId)
                {
                    return;
                }

                break;
            case "task":
                var task = await store.FindTaskIncludingDeletedAsync(id, cancellationToken);
                if (task?.DeletedAt is not null && scope.IsMentor && scope.CanViewDeveloper(task.DeveloperId))
                {
                    return;
                }

                break;
            case "feedback":
                var comment = await store.FindFeedbackIncludingDeletedAsync(id, cancellationToken);
                if (comment?.DeletedAt is not null && CanSeeDeletedFeedback(scope, comment))
                {
                    return;
                }

                break;
            case "employee":
            case "mentor":
            case "project":
                if (scope.IsPrivileged)
                {
                    return;
                }

                break;
        }

        throw new ForbiddenException();
    }

    private bool CanSeeDeletedTask(AccessScope scope, WorkTask task)
    {
        if (scope.IsAdmin)
        {
            return true;
        }

        return scope.IsMentor && scope.CanViewDeveloper(task.DeveloperId);
    }

    private bool CanSeeDeletedEntry(AccessScope scope, DailyUpdate entry)
    {
        if (scope.IsAdmin)
        {
            return true;
        }

        return currentUser.DeveloperId == entry.DeveloperId;
    }

    private bool CanSeeDeletedFeedback(AccessScope scope, Feedback comment)
    {
        if (scope.IsAdmin)
        {
            return true;
        }

        if (!scope.IsMentor)
        {
            return false;
        }

        return comment.AuthorProfileId == currentUser.ProfileId
            || (comment.AuthorProfileId is null && comment.MentorId == currentUser.MentorId);
    }

    private async Task RestoreWorkRowAsync<T>(T? row, CancellationToken cancellationToken)
        where T : class, ISoftDeletable
    {
        if (row is null || row.DeletedAt is null)
        {
            throw new NotFoundException("That item is not in Recently deleted.");
        }

        row.DeletedAt = null;
        row.DeletedBy = null;
        await store.SaveChangesAsync(cancellationToken);
    }

    private static async Task DestroyWorkRowAsync<T>(
        T? row,
        Func<Task> hardDelete) where T : class, ISoftDeletable
    {
        if (row is null || row.DeletedAt is null)
        {
            throw new NotFoundException("That item is not in Recently deleted.");
        }

        await hardDelete();
    }
}
