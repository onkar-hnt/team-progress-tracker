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

public interface ILeaveDayReader
{
    Task<IReadOnlyList<LeaveDayRow>> ListAsync(
        DateOnly from,
        DateOnly to,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// The columns Reporting is allowed to read from team.LeaveDays. No project,
/// because a leave day names none: a day off is not work on one project.
/// </summary>
public sealed record LeaveDayRow(Guid DeveloperId, DateOnly LeaveDate, string? Note);

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
