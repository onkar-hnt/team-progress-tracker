using Contracts;

using Microsoft.EntityFrameworkCore;

using SharedKernel;

using Work.Application;
using Work.Domain;

namespace Work.Infrastructure;

public sealed class WorkStore(WorkDbContext context, WorkBusinessCodeAllocator codes) : IWorkStore
{
    public Task<WorkTask?> FindTaskAsync(Guid id, CancellationToken cancellationToken) =>
        context.Tasks.FirstOrDefaultAsync(row => row.Id == id && row.DeletedAt == null, cancellationToken);

    public Task<WorkTask?> FindTaskIncludingDeletedAsync(Guid id, CancellationToken cancellationToken) =>
        context.Tasks.FirstOrDefaultAsync(row => row.Id == id, cancellationToken);

    public async Task<IReadOnlyList<WorkTask>> QueryTasksAsync(
        TaskQuery query,
        AccessScope scope,
        CancellationToken cancellationToken)
    {
        if (QueryFilterHelper.IsExplicitEmptyGuids(query.DeveloperIds)
            || QueryFilterHelper.IsExplicitEmptyGuids(query.MentorIds)
            || QueryFilterHelper.IsExplicitEmptyGuids(query.ProjectIds)
            || QueryFilterHelper.IsExplicitEmptyStrings(query.Statuses)
            || QueryFilterHelper.IsExplicitEmptyStrings(query.Priorities))
        {
            return [];
        }

        var developerFilter = scope.RestrictDeveloperIds(query.DeveloperIds);

        if (developerFilter is { Count: 0 })
        {
            return [];
        }

        var rows = context.Tasks.AsNoTracking().Where(row => row.DeletedAt == null);

        if (developerFilter is { Count: > 0 } developerIds)
        {
            rows = rows.Where(row => developerIds.Contains(row.DeveloperId));
        }

        if (query.MentorIds is { Count: > 0 } mentorIds)
        {
            rows = rows.Where(row => row.MentorId != null && mentorIds.Contains(row.MentorId.Value));
        }

        if (query.ProjectIds is { Count: > 0 } projectIds)
        {
            rows = rows.Where(row => projectIds.Contains(row.ProjectId));
        }

        if (query.Statuses is { Count: > 0 } statuses)
        {
            rows = rows.Where(row => statuses.Contains(row.Status));
        }

        if (query.Priorities is { Count: > 0 } priorities)
        {
            rows = rows.Where(row => priorities.Contains(row.Priority));
        }

        if (!string.IsNullOrWhiteSpace(query.DueOnOrBefore))
        {
            var due = DateStrings.ParseDate(query.DueOnOrBefore, "Due date");
            rows = rows.Where(row => row.DueDate != null && row.DueDate <= due);
        }

        var list = await rows
            .OrderByDescending(row => row.UpdatedAt)
            .ThenByDescending(row => row.Id)
            .ToListAsync(cancellationToken);

        list = [.. list.Where(row => scope.CanViewDeveloper(row.DeveloperId)
            || (scope.MentorId is Guid mentorId && row.MentorId == mentorId))];

        if (query.Limit is int limit && limit > 0)
        {
            list = [.. list.Take(limit)];
        }

        return list;
    }

    public void AddTask(WorkTask task) => context.Tasks.Add(task);

    public void RemoveTask(WorkTask task) => context.Tasks.Remove(task);

    public void DetachTask(WorkTask task) => context.Entry(task).State = EntityState.Detached;

    public Task<DailyUpdate?> FindDailyUpdateAsync(Guid id, CancellationToken cancellationToken) =>
        context.DailyUpdates.FirstOrDefaultAsync(row => row.Id == id && row.DeletedAt == null, cancellationToken);

    public async Task<IReadOnlyList<DailyUpdate>> QueryDailyUpdatesAsync(
        DailyWorkQuery query,
        AccessScope scope,
        CancellationToken cancellationToken)
    {
        if (QueryFilterHelper.IsExplicitEmptyGuids(query.DeveloperIds)
            || QueryFilterHelper.IsExplicitEmptyGuids(query.ProjectIds)
            || QueryFilterHelper.IsExplicitEmptyStrings(query.Statuses)
            || QueryFilterHelper.IsExplicitEmptyStrings(query.Priorities))
        {
            return [];
        }

        var rows = context.DailyUpdates.AsNoTracking().Where(row => row.DeletedAt == null);

        if (!string.IsNullOrWhiteSpace(query.DateFrom))
        {
            var from = DateStrings.ParseDate(query.DateFrom, "Date from");
            rows = rows.Where(row => row.EntryDate >= from);
        }

        if (!string.IsNullOrWhiteSpace(query.DateTo))
        {
            var to = DateStrings.ParseDate(query.DateTo, "Date to");
            rows = rows.Where(row => row.EntryDate <= to);
        }

        if (query.DeveloperIds is { Count: > 0 } developerIds)
        {
            rows = rows.Where(row => developerIds.Contains(row.DeveloperId));
        }
        else if (scope.VisibleDeveloperIds is not null)
        {
            var allowed = scope.VisibleDeveloperIds.ToList();
            rows = rows.Where(row => allowed.Contains(row.DeveloperId));
        }

        if (query.ProjectIds is { Count: > 0 } projectIds)
        {
            rows = rows.Where(row => projectIds.Contains(row.ProjectId));
        }

        if (query.Statuses is { Count: > 0 } statuses)
        {
            rows = rows.Where(row => statuses.Contains(row.Status));
        }

        if (query.Priorities is { Count: > 0 } priorities)
        {
            rows = rows.Where(row => priorities.Contains(row.Priority));
        }

        if (query.IsBlocked is bool blocked)
        {
            rows = rows.Where(row => row.IsBlocked == blocked);
        }

        var ordered = rows
            .OrderByDescending(row => row.EntryDate)
            .ThenByDescending(row => row.Id);

        if (query.Limit is int limit && limit > 0)
        {
            return await ordered.Take(limit).ToListAsync(cancellationToken);
        }

        return await ordered.ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<DailyUpdate>> ListActiveEntriesForTaskAsync(
        Guid taskId,
        CancellationToken cancellationToken) =>
        await context.DailyUpdates
            .Where(row => row.TaskId == taskId && row.DeletedAt == null)
            .ToListAsync(cancellationToken);

    public async Task<WorkTask?> FindMatchingTaskByTitleAsync(
        Guid developerId,
        Guid projectId,
        string trimmedTitle,
        CancellationToken cancellationToken)
    {
        var candidates = await context.Tasks
            .Where(row =>
                row.DeletedAt == null
                && row.DeveloperId == developerId
                && row.ProjectId == projectId)
            .OrderByDescending(row => row.CreatedAt)
            .ToListAsync(cancellationToken);

        return candidates.FirstOrDefault(row =>
            string.Equals(row.Name.Trim(), trimmedTitle, StringComparison.OrdinalIgnoreCase));
    }

    public void AddDailyUpdate(DailyUpdate entry) => context.DailyUpdates.Add(entry);

    public void RemoveDailyUpdate(DailyUpdate entry) => context.DailyUpdates.Remove(entry);

    public Task<Feedback?> FindFeedbackAsync(Guid id, CancellationToken cancellationToken) =>
        context.Feedback.FirstOrDefaultAsync(row => row.Id == id && row.DeletedAt == null, cancellationToken);

    public async Task<IReadOnlyList<Feedback>> QueryFeedbackAsync(
        CommentQuery query,
        AccessScope scope,
        CancellationToken cancellationToken)
    {
        if (QueryFilterHelper.IsExplicitEmptyGuids(query.DeveloperIds)
            || QueryFilterHelper.IsExplicitEmptyGuids(query.MentorIds)
            || QueryFilterHelper.IsExplicitEmptyGuids(query.ProjectIds)
            || QueryFilterHelper.IsExplicitEmptyGuids(query.TaskIds))
        {
            return [];
        }

        var rows = context.Feedback.AsNoTracking().Where(row => row.DeletedAt == null);

        if (query.DeveloperIds is { Count: > 0 } developerIds)
        {
            rows = rows.Where(row => developerIds.Contains(row.DeveloperId));
        }
        else if (scope.VisibleDeveloperIds is not null)
        {
            var allowed = scope.VisibleDeveloperIds.ToList();
            rows = rows.Where(row => allowed.Contains(row.DeveloperId));
        }

        if (query.MentorIds is { Count: > 0 } mentorIds)
        {
            rows = rows.Where(row => row.MentorId != null && mentorIds.Contains(row.MentorId.Value));
        }

        if (query.ProjectIds is { Count: > 0 } projectIds)
        {
            rows = rows.Where(row => row.ProjectId != null && projectIds.Contains(row.ProjectId.Value));
        }

        if (query.TaskIds is { Count: > 0 } taskIds)
        {
            rows = rows.Where(row => row.TaskId != null && taskIds.Contains(row.TaskId.Value));
        }

        if (!string.IsNullOrWhiteSpace(query.DateFrom))
        {
            var from = DateStrings.ParseDate(query.DateFrom, "Date from");
            rows = rows.Where(row => row.FeedbackDate >= from);
        }

        if (!string.IsNullOrWhiteSpace(query.DateTo))
        {
            var to = DateStrings.ParseDate(query.DateTo, "Date to");
            rows = rows.Where(row => row.FeedbackDate <= to);
        }

        var ordered = rows
            .OrderByDescending(row => row.FeedbackDate)
            .ThenByDescending(row => row.Id);

        if (query.Limit is int limit && limit > 0)
        {
            return await ordered.Take(limit).ToListAsync(cancellationToken);
        }

        return await ordered.ToListAsync(cancellationToken);
    }

    public void AddFeedback(Feedback comment) => context.Feedback.Add(comment);

    public void RemoveFeedback(Feedback comment) => context.Feedback.Remove(comment);

    public void DetachFeedback(Feedback comment) => context.Entry(comment).State = EntityState.Detached;

    public async Task<IReadOnlyList<RecordHistory>> QueryChangeLogAsync(
        int limit,
        AccessScope scope,
        CancellationToken cancellationToken)
    {
        var rows = await context.RecordHistories
            .AsNoTracking()
            .OrderByDescending(row => row.ChangedAt)
            .Take(Math.Max(limit, 1))
            .ToListAsync(cancellationToken);

        return FilterHistory(rows, scope);
    }

    public async Task<IReadOnlyList<RecordHistory>> QueryChangeLogForRecordAsync(
        string tableName,
        Guid recordId,
        AccessScope scope,
        CancellationToken cancellationToken)
    {
        var rows = await context.RecordHistories
            .AsNoTracking()
            .Where(row => row.TableName == tableName && row.RecordId == recordId)
            .OrderByDescending(row => row.ChangedAt)
            .ToListAsync(cancellationToken);

        return FilterHistory(rows, scope);
    }

    public Task<string> AllocateTaskCodeAsync(CancellationToken cancellationToken) =>
        codes.NextTaskCodeAsync(cancellationToken);

    public Task<string> AllocateCommentCodeAsync(CancellationToken cancellationToken) =>
        codes.NextCommentCodeAsync(cancellationToken);

    public Task<DailyUpdate?> FindDailyUpdateIncludingDeletedAsync(Guid id, CancellationToken cancellationToken) =>
        context.DailyUpdates.FirstOrDefaultAsync(row => row.Id == id, cancellationToken);

    public Task<Feedback?> FindFeedbackIncludingDeletedAsync(Guid id, CancellationToken cancellationToken) =>
        context.Feedback.FirstOrDefaultAsync(row => row.Id == id, cancellationToken);

    public async Task<IReadOnlyList<WorkTask>> ListDeletedTasksAsync(CancellationToken cancellationToken) =>
        await context.Tasks.AsNoTracking().Where(row => row.DeletedAt != null).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<DailyUpdate>> ListDeletedEntriesAsync(CancellationToken cancellationToken) =>
        await context.DailyUpdates.AsNoTracking().Where(row => row.DeletedAt != null).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Feedback>> ListDeletedFeedbackAsync(CancellationToken cancellationToken) =>
        await context.Feedback.AsNoTracking().Where(row => row.DeletedAt != null).ToListAsync(cancellationToken);

    public Task HardDeleteTaskAsync(Guid id, CancellationToken cancellationToken) =>
        context.Tasks.Where(row => row.Id == id).ExecuteDeleteAsync(cancellationToken);

    public Task HardDeleteDailyUpdateAsync(Guid id, CancellationToken cancellationToken) =>
        context.DailyUpdates.Where(row => row.Id == id).ExecuteDeleteAsync(cancellationToken);

    public Task HardDeleteFeedbackAsync(Guid id, CancellationToken cancellationToken) =>
        context.Feedback.Where(row => row.Id == id).ExecuteDeleteAsync(cancellationToken);

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            throw UniqueViolationMapper.TryMap(exception) ?? exception;
        }
    }

    private static IReadOnlyList<RecordHistory> FilterHistory(IReadOnlyList<RecordHistory> rows, AccessScope scope)
    {
        if (scope.IsAdmin)
        {
            return rows;
        }

        return [.. rows.Where(row =>
        {
            if (row.SubjectDeveloperId is Guid developerId)
            {
                return scope.CanViewDeveloper(developerId);
            }

            return scope.IsPrivileged;
        })];
    }
}
