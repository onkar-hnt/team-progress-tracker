using Contracts;

using SharedKernel;

namespace Reporting.Application;

/// <summary>
/// The same counting and hour rules as src/utils/work-summary.utils.ts, kept
/// here so the Reports screen matches without shipping every entry to the browser.
/// </summary>
public static class WorkSummaryCalculator
{
    public static StatusSummaryDto SummariseStatuses(IReadOnlyList<WorkEntryRow> entries) => new()
    {
        Total = entries.Count,
        NotStarted = entries.Count(entry => entry.Status == DomainRules.TaskNotStarted),
        InProgress = entries.Count(entry => entry.Status == DomainRules.TaskInProgress),
        Completed = entries.Count(entry => entry.Status == DomainRules.TaskCompleted),
        Blocked = entries.Count(entry => entry.Status == DomainRules.TaskBlocked),
    };

    public static int CompletionRate(IReadOnlyList<WorkEntryRow> entries)
    {
        if (entries.Count == 0)
        {
            return 0;
        }

        var completed = entries.Count(entry => entry.Status == DomainRules.TaskCompleted);

        return (int)Math.Round(completed * 100.0 / entries.Count, MidpointRounding.AwayFromZero);
    }

    public static decimal SumHoursLogged(IReadOnlyList<WorkEntryRow> entries)
    {
        var byDay = new Dictionary<(Guid DeveloperId, DateOnly Date), (decimal Reported, bool HasReport)>();

        foreach (var entry in entries)
        {
            var key = (entry.DeveloperId, entry.EntryDate);

            if (!byDay.TryGetValue(key, out var day))
            {
                day = (0, false);
            }

            byDay[key] = (
                day.Reported + (entry.HoursSpent ?? 0),
                day.HasReport || entry.HoursSpent.HasValue);
        }

        decimal total = 0;

        foreach (var day in byDay.Values)
        {
            total += day.HasReport ? day.Reported : DomainRules.StandardWorkingHours;
        }

        return Math.Round(total, 2, MidpointRounding.AwayFromZero);
    }
}
