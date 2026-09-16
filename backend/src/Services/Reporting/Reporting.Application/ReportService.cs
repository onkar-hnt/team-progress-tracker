using Contracts;

using Reporting.Domain;

using SharedKernel;

namespace Reporting.Application;

public sealed class ReportService(
    IWorkEntryReader workEntries,
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

        var entries = await workEntries.ListAsync(
            period.From,
            period.To,
            projectId,
            developerFilter,
            cancellationToken);

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

        var entries = await workEntries.ListAsync(
            period.From,
            period.To,
            projectId,
            [developerId],
            cancellationToken);

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

        var entries = await workEntries.ListAsync(
            period.From,
            period.To,
            null,
            developerFilter,
            cancellationToken);

        var projectNames = await teamDirectory.GetProjectNamesAsync(cancellationToken);

        return BuildProjectTotals(entries, projectNames);
    }

    private static TeamReportDto EmptyTeamReport(ReportPeriod period) => new()
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
