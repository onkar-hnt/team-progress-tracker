using Work.Domain;

namespace Work.Application;

public interface IWorkStore
{
    Task<WorkTask?> FindTaskAsync(Guid id, CancellationToken cancellationToken);
    Task<WorkTask?> FindTaskIncludingDeletedAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<WorkTask>> QueryTasksAsync(TaskQuery query, AccessScope scope, CancellationToken cancellationToken);
    void AddTask(WorkTask task);
    void RemoveTask(WorkTask task);
    void DetachTask(WorkTask task);

    Task<DailyUpdate?> FindDailyUpdateAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<DailyUpdate>> QueryDailyUpdatesAsync(DailyWorkQuery query, AccessScope scope, CancellationToken cancellationToken);
    Task<IReadOnlyList<DailyUpdate>> ListActiveEntriesForTaskAsync(Guid taskId, CancellationToken cancellationToken);
    Task<WorkTask?> FindMatchingTaskByTitleAsync(Guid developerId, Guid projectId, string trimmedTitle, CancellationToken cancellationToken);
    void AddDailyUpdate(DailyUpdate entry);
    void RemoveDailyUpdate(DailyUpdate entry);

    Task<Feedback?> FindFeedbackAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<Feedback>> QueryFeedbackAsync(CommentQuery query, AccessScope scope, CancellationToken cancellationToken);
    void AddFeedback(Feedback comment);
    void RemoveFeedback(Feedback comment);
    void DetachFeedback(Feedback comment);

    Task<IReadOnlyList<RecordHistory>> QueryChangeLogAsync(int limit, AccessScope scope, CancellationToken cancellationToken);
    Task<IReadOnlyList<RecordHistory>> QueryChangeLogForRecordAsync(string tableName, Guid recordId, AccessScope scope, CancellationToken cancellationToken);

    Task<string> AllocateTaskCodeAsync(CancellationToken cancellationToken);
    Task<string> AllocateCommentCodeAsync(CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);

    Task<DailyUpdate?> FindDailyUpdateIncludingDeletedAsync(Guid id, CancellationToken cancellationToken);
    Task<Feedback?> FindFeedbackIncludingDeletedAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<WorkTask>> ListDeletedTasksAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<DailyUpdate>> ListDeletedEntriesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<Feedback>> ListDeletedFeedbackAsync(CancellationToken cancellationToken);

    Task HardDeleteTaskAsync(Guid id, CancellationToken cancellationToken);
    Task HardDeleteDailyUpdateAsync(Guid id, CancellationToken cancellationToken);
    Task HardDeleteFeedbackAsync(Guid id, CancellationToken cancellationToken);
}
