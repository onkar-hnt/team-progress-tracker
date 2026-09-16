using Contracts;

using Work.Application;
using Work.Domain;

namespace Backend.UnitTests.Fakes;

internal sealed class FakeWorkStore : IWorkStore
{
    private readonly List<WorkTask> _tasks = [];
    private readonly List<DailyUpdate> _entries = [];
    private int _codeSequence;

    public IReadOnlyList<WorkTask> Tasks => _tasks;
    public IReadOnlyList<DailyUpdate> Entries => _entries;

    public void SeedTask(WorkTask task) => _tasks.Add(task);

    public void SeedEntry(DailyUpdate entry) => _entries.Add(entry);

    public Task<WorkTask?> FindTaskAsync(Guid id, CancellationToken cancellationToken) =>
        Task.FromResult(_tasks.FirstOrDefault(task => task.Id == id && task.DeletedAt is null));

    public Task<WorkTask?> FindMatchingTaskByTitleAsync(
        Guid developerId,
        Guid projectId,
        string trimmedTitle,
        CancellationToken cancellationToken) =>
        Task.FromResult(_tasks.FirstOrDefault(task =>
            task.DeletedAt is null
            && task.DeveloperId == developerId
            && task.ProjectId == projectId
            && task.Name == trimmedTitle));

    public Task<IReadOnlyList<DailyUpdate>> ListActiveEntriesForTaskAsync(
        Guid taskId,
        CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<DailyUpdate>>([.. _entries.Where(entry =>
            entry.TaskId == taskId && entry.DeletedAt is null)]);

    public void AddTask(WorkTask task) => _tasks.Add(task);

    public Task<string> AllocateTaskCodeAsync(CancellationToken cancellationToken) =>
        Task.FromResult($"T{++_codeSequence:D4}");

    public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public Task<WorkTask?> FindTaskIncludingDeletedAsync(Guid id, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<IReadOnlyList<WorkTask>> QueryTasksAsync(
        TaskQuery query,
        AccessScope scope,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public void RemoveTask(WorkTask task) => throw new NotImplementedException();

    public void DetachTask(WorkTask task) => throw new NotImplementedException();

    public Task<DailyUpdate?> FindDailyUpdateAsync(Guid id, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<IReadOnlyList<DailyUpdate>> QueryDailyUpdatesAsync(
        DailyWorkQuery query,
        AccessScope scope,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public void AddDailyUpdate(DailyUpdate entry) => _entries.Add(entry);

    public void RemoveDailyUpdate(DailyUpdate entry) => throw new NotImplementedException();

    public Task<Feedback?> FindFeedbackAsync(Guid id, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<IReadOnlyList<Feedback>> QueryFeedbackAsync(
        CommentQuery query,
        AccessScope scope,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public void AddFeedback(Feedback comment) => throw new NotImplementedException();

    public void RemoveFeedback(Feedback comment) => throw new NotImplementedException();

    public void DetachFeedback(Feedback comment) => throw new NotImplementedException();

    public Task<IReadOnlyList<RecordHistory>> QueryChangeLogAsync(
        int limit,
        AccessScope scope,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<IReadOnlyList<RecordHistory>> QueryChangeLogForRecordAsync(
        string tableName,
        Guid recordId,
        AccessScope scope,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<string> AllocateCommentCodeAsync(CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<DailyUpdate?> FindDailyUpdateIncludingDeletedAsync(Guid id, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<Feedback?> FindFeedbackIncludingDeletedAsync(Guid id, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<IReadOnlyList<WorkTask>> ListDeletedTasksAsync(CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<IReadOnlyList<DailyUpdate>> ListDeletedEntriesAsync(CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<IReadOnlyList<Feedback>> ListDeletedFeedbackAsync(CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task HardDeleteTaskAsync(Guid id, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task HardDeleteDailyUpdateAsync(Guid id, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task HardDeleteFeedbackAsync(Guid id, CancellationToken cancellationToken) =>
        throw new NotImplementedException();
}
