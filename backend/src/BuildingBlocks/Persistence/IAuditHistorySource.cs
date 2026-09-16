namespace Persistence;

/// <summary>
/// Marks an entity whose inserts, updates and soft deletes are written to
/// work.RecordHistory. Team will implement this on its roster rows
/// when it registers <see cref="ChangeHistoryInterceptor"/>.
/// </summary>
public interface IAuditHistorySource
{
    string HistoryTableName { get; }

    string GetHistorySubject();

    Guid? HistorySubjectDeveloperId { get; }
}
