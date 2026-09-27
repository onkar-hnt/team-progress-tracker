using Contracts;

using SharedKernel;

namespace Reporting.Application;

/// <summary>
/// Which working days each developer has accounted for, and how.
/// </summary>
/// <remarks>
/// Only working days are asked about, and only of people who owe an update —
/// the same two rules the dashboard's missing-update list applies. A day is
/// answered by an update or by a leave day; anything else is a gap.
/// <para>
/// Deliberately a calculation over rows that already exist rather than a state
/// stored per day. Nothing has to be written when a day passes, and a day that
/// is filled in later stops being missing the moment the entry lands.
/// </para>
/// </remarks>
public static class UpdateCoverageCalculator
{
    public const string StateLeave = "leave";
    public const string StateMissing = "missing";
    public const string StateSubmitted = "submitted";

    public static UpdateCoverageDto Build(
        DateOnly from,
        DateOnly to,
        IReadOnlyList<RosterDeveloper> developers,
        IReadOnlyList<WorkEntryRow> entries,
        IReadOnlyList<LeaveDayRow> leaveDays)
    {
        // Newest first, which is the order both screens read in.
        var dates = DomainRules.ListWorkingDates(from, to).Reverse().ToList();

        var submitted = GroupDatesByDeveloper(entries);
        var leave = IndexLeaveByDeveloper(leaveDays);

        var rows = developers
            .Where(OwesDailyUpdates)
            .Select(developer => ForDeveloper(
                developer,
                dates,
                submitted.GetValueOrDefault(developer.Id),
                leave.GetValueOrDefault(developer.Id)))
            .ToList();

        return new UpdateCoverageDto
        {
            From = DateStrings.From(from),
            To = DateStrings.From(to),
            Developers = rows,
            Totals = new UpdateCoverageTotalsDto
            {
                DevelopersWithGaps = rows.Count(row => row.MissingCount > 0),
                MissingDays = rows.Sum(row => row.MissingCount),
                LeaveDays = rows.Sum(row => row.LeaveCount),
            },
        };
    }

    /// <summary>Administrators and mentors do not submit daily updates.</summary>
    public static bool OwesDailyUpdates(RosterDeveloper developer) =>
        developer.Active
        && (developer.AccessRole is null || developer.AccessRole == DomainRules.RoleDeveloper);

    private static DeveloperUpdateCoverageDto ForDeveloper(
        RosterDeveloper developer,
        IReadOnlyList<DateOnly> dates,
        IReadOnlySet<DateOnly>? submitted,
        IReadOnlyDictionary<DateOnly, LeaveDayRow>? leave)
    {
        var days = new List<UpdateDayDto>(dates.Count);

        foreach (var date in dates)
        {
            var text = DateStrings.From(date);

            if (submitted is not null && submitted.Contains(date))
            {
                days.Add(new UpdateDayDto { Date = text, State = StateSubmitted });
            }
            else if (leave is not null && leave.TryGetValue(date, out var leaveDay))
            {
                days.Add(new UpdateDayDto { Date = text, State = StateLeave, Note = leaveDay.Note });
            }
            else
            {
                days.Add(new UpdateDayDto { Date = text, State = StateMissing });
            }
        }

        var missingDates = days.Where(day => day.State == StateMissing).Select(day => day.Date).ToList();
        var leaveDates = days.Where(day => day.State == StateLeave).Select(day => day.Date).ToList();
        var submittedDays = days.Where(day => day.State == StateSubmitted).ToList();

        return new DeveloperUpdateCoverageDto
        {
            DeveloperId = developer.Id,
            DeveloperName = developer.Name,
            Days = days,
            MissingDates = missingDates,
            LeaveDates = leaveDates,
            SubmittedCount = submittedDays.Count,
            MissingCount = missingDates.Count,
            LeaveCount = leaveDates.Count,

            // days is newest first, so the first submitted day is the most
            // recent one.
            LastSubmittedDate = submittedDays.FirstOrDefault()?.Date,
        };
    }

    /// <summary>
    /// Several entries may share a day; the question is only whether one exists.
    /// </summary>
    private static Dictionary<Guid, IReadOnlySet<DateOnly>> GroupDatesByDeveloper(
        IReadOnlyList<WorkEntryRow> entries) =>
        entries
            .GroupBy(entry => entry.DeveloperId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlySet<DateOnly>)group.Select(entry => entry.EntryDate).ToHashSet());

    private static Dictionary<Guid, IReadOnlyDictionary<DateOnly, LeaveDayRow>> IndexLeaveByDeveloper(
        IReadOnlyList<LeaveDayRow> leaveDays) =>
        leaveDays
            .GroupBy(day => day.DeveloperId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyDictionary<DateOnly, LeaveDayRow>)group
                    .GroupBy(day => day.LeaveDate)
                    .ToDictionary(byDate => byDate.Key, byDate => byDate.First()));
}
