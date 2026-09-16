using Contracts;

namespace Reporting.Application;

public interface IUsageReader
{
    Task<ResourceUsageDto> ReadAsync(DateTimeOffset measuredAt, CancellationToken cancellationToken = default);
}

public interface IWorkEntryReader
{
    Task<IReadOnlyList<WorkEntryRow>> ListAsync(
        DateOnly from,
        DateOnly to,
        Guid? projectId,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// The columns Reporting is allowed to read from work.DailyUpdates.
/// </summary>
public sealed record WorkEntryRow(
    Guid Id,
    Guid DeveloperId,
    Guid ProjectId,
    Guid? TaskId,
    DateOnly EntryDate,
    string TaskTitle,
    string Status,
    string Priority,
    int Progress,
    decimal? HoursSpent,
    decimal? EstimatedHours,
    bool IsBlocked);
