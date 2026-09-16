namespace Persistence;

/// <summary>
/// DbContexts that enqueue rows for work.RecordHistory implement this so
/// <see cref="ChangeHistoryInterceptor"/> stays schema-agnostic.
/// </summary>
public interface IRecordHistorySink
{
    void EnqueueRecordHistory(PendingRecordHistory entry);
}

public sealed class PendingRecordHistory
{
    public Guid Id { get; init; } = Guid.CreateVersion7();
    public required string TableName { get; init; }
    public required Guid RecordId { get; init; }
    public required string Action { get; init; }
    public required string Subject { get; init; }
    public Guid? SubjectDeveloperId { get; init; }
    public Guid? ChangedBy { get; init; }
    public required string ChangedByName { get; init; }
    public required DateTimeOffset ChangedAt { get; init; }
    public required string Changes { get; init; }
}
