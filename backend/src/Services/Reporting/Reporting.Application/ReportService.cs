using Contracts;

using Reporting.Domain;

using SharedKernel;

namespace Reporting.Application;

public sealed class ReportService(
    IWorkEntryReader workEntries,
    ILeaveDayReader leaveDays,
    ITeamDirectory teamDirectory,
    ReportAccessScopeFactory accessScope)
{
    public async Task<TeamReportDto> GetTeamReportAsync(
        string? from,
        string? to,
        Guid? projectId,
        CancellationToken cancellationToken = default)
    {
        var period = ReportPeriod.Resolve(from, to);
        var scope = await accessScope.CreateAsync(cancellationToken);

        var developerFilter = scope.RestrictDeveloperIds(null);

        if (developerFilter is { Count: 0 })
        {
            return EmptyTeamReport(period);
        }

        var entries = VisibleTo(scope, await workEntries.ListAsync(
            period.From,
            period.To,
            projectId,
            developerFilter,
            cancellationToken));

        var developerNames = await teamDirectory.GetDeveloperNamesAsync(cancellationToken);
        var projectNames = await teamDirectory.GetProjectNamesAsync(cancellationToken);

        var statuses = WorkSummaryCalculator.SummariseStatuses(entries);

        return new TeamReportDto
        {
            From = DateStrings.From(period.From),
            To = DateStrings.From(period.To),
            Statuses = statuses,
            HoursLogged = WorkSummaryCalculator.SumHoursLogged(entries),
            CompletionRate = WorkSummaryCalculator.CompletionRate(entries),
            Developers = BuildDeveloperTotals(entries, developerNames),
            Projects = BuildProjectTotals(entries, projectNames),
        };
    }

    public async Task<DeveloperTotalsDto> GetDeveloperReportAsync(
        Guid developerId,
        string? from,
        string? to,
        Guid? projectId,
        CancellationToken cancellationToken = default)
    {
        var period = ReportPeriod.Resolve(from, to);
        var scope = await accessScope.CreateAsync(cancellationToken);
        scope.RequireDeveloperVisible(developerId);

        var entries = VisibleTo(scope, await workEntries.ListAsync(
            period.From,
            period.To,
            projectId,
            [developerId],
            cancellationToken));

        var developer = await teamDirectory.FindDeveloperAsync(developerId, cancellationToken);
        var name = developer?.Name ?? "Unknown";

        return new DeveloperTotalsDto
        {
            DeveloperId = developerId,
            DeveloperName = name,
            Entries = entries.Count,
            DaysLogged = entries.Select(entry => entry.EntryDate).Distinct().Count(),
            HoursLogged = WorkSummaryCalculator.SumHoursLogged(entries),
            CompletionRate = WorkSummaryCalculator.CompletionRate(entries),
            Statuses = WorkSummaryCalculator.SummariseStatuses(entries),
            BlockedEntries = entries.Count(entry => entry.IsBlocked),
        };
    }

    public async Task<IReadOnlyList<ProjectTotalsDto>> GetProjectReportsAsync(
        string? from,
        string? to,
        CancellationToken cancellationToken = default)
    {
        var period = ReportPeriod.Resolve(from, to);
        var scope = await accessScope.CreateAsync(cancellationToken);

        var developerFilter = scope.RestrictDeveloperIds(null);

        if (developerFilter is { Count: 0 })
        {
            return [];
        }

        var entries = VisibleTo(scope, await workEntries.ListAsync(
            period.From,
            period.To,
            null,
            developerFilter,
            cancellationToken));

        var projectNames = await teamDirectory.GetProjectNamesAsync(cancellationToken);

        return BuildProjectTotals(entries, projectNames);
    }

    /// <summary>
    /// Which working days each visible developer has accounted for, and how.
    /// </summary>
    /// <remarks>
    /// Reads the three sets separately and joins them rather than asking the
    /// database for the gaps, because a gap is the absence of a row: there is
    /// nothing to select, and which days should exist is a calendar question.
    /// <para>
    /// The updates are narrowed by project like every other work read, so a
    /// mentor's view of a shared employee stops at the projects they are
    /// responsible for. The leave days are not: a leave day names no project.
    /// </para>
    /// </remarks>
    public async Task<UpdateCoverageDto> GetUpdateCoverageAsync(
        string? from,
        string? to,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken = default)
    {
        var period = ReportPeriod.ResolveLookback(from, to, DomainRules.MissingUpdateLookbackDays);
        var scope = await accessScope.CreateAsync(cancellationToken);

        var developerFilter = scope.RestrictDeveloperIds(developerIds);

        if (developerFilter is { Count: 0 })
        {
            return EmptyCoverage(period);
        }

        // Three independent reads on three connections, so they go together
        // rather than one after another: none of them narrows the others, and
        // the calendar they are joined against is not a query at all.
        var entriesTask = workEntries.ListAsync(
            period.From,
            period.To,
            null,
            developerFilter,
            cancellationToken);

        var leaveTask = leaveDays.ListAsync(
            period.From,
            period.To,
            developerFilter,
            cancellationToken);

        var rosterTask = teamDirectory.ListDevelopersAsync(cancellationToken);

        await Task.WhenAll(entriesTask, leaveTask, rosterTask);

        var entries = VisibleTo(scope, await entriesTask);
        var leave = await leaveTask;
        var roster = await rosterTask;

        var asked = developerFilter is null
            ? roster.Where(developer => scope.CanViewDeveloper(developer.Id)).ToList()
            : [.. roster.Where(developer => developerFilter.Contains(developer.Id))];

        return UpdateCoverageCalculator.Build(period.From, period.To, asked, entries, leave);
    }

    /// <summary>
    /// A report summarises the same work the tables themselves would show, so a
    /// mentor's totals stop at the projects they are responsible for.
    /// </summary>
    private static IReadOnlyList<WorkEntryRow> VisibleTo(
        AccessScope scope,
        IReadOnlyList<WorkEntryRow> entries) =>
        scope.ReadsEveryProject
            ? entries
            : [.. entries.Where(entry =>
                scope.CanViewDeveloperProject(entry.DeveloperId, entry.ProjectId))];

    private static TeamReportDto EmptyTeamReport(ReportPeriod period) => new()
    {
        From = DateStrings.From(period.From),
        To = DateStrings.From(period.To),
    };

    private static UpdateCoverageDto EmptyCoverage(ReportPeriod period) => new()
    {
        From = DateStrings.From(period.From),
        To = DateStrings.From(period.To),
    };

    private static IReadOnlyList<DeveloperTotalsDto> BuildDeveloperTotals(
        IReadOnlyList<WorkEntryRow> entries,
        IReadOnlyDictionary<Guid, string> names)
    {
        return entries
            .GroupBy(entry => entry.DeveloperId)
            .Select(group =>
            {
                var slice = group.ToList();

                return new DeveloperTotalsDto
                {
                    DeveloperId = group.Key,
                    DeveloperName = names.TryGetValue(group.Key, out var name) ? name : "Unknown",
                    Entries = slice.Count,
                    DaysLogged = slice.Select(entry => entry.EntryDate).Distinct().Count(),
                    HoursLogged = WorkSummaryCalculator.SumHoursLogged(slice),
                    CompletionRate = WorkSummaryCalculator.CompletionRate(slice),
                    Statuses = WorkSummaryCalculator.SummariseStatuses(slice),
                    BlockedEntries = slice.Count(entry => entry.IsBlocked),
                };
            })
            .OrderBy(row => row.DeveloperName)
            .ToList();
    }

    private static IReadOnlyList<ProjectTotalsDto> BuildProjectTotals(
        IReadOnlyList<WorkEntryRow> entries,
        IReadOnlyDictionary<Guid, string> names)
    {
        return entries
            .GroupBy(entry => entry.ProjectId)
            .Select(group =>
            {
                var slice = group.ToList();

                return new ProjectTotalsDto
                {
                    ProjectId = group.Key,
                    ProjectName = names.TryGetValue(group.Key, out var name) ? name : "Unknown",
                    Entries = slice.Count,
                    Contributors = slice.Select(entry => entry.DeveloperId).Distinct().Count(),
                    HoursLogged = WorkSummaryCalculator.SumHoursLogged(slice),
                    CompletionRate = WorkSummaryCalculator.CompletionRate(slice),
                    Statuses = WorkSummaryCalculator.SummariseStatuses(slice),
                };
            })
            .OrderBy(row => row.ProjectName)
            .ToList();
    }

}
