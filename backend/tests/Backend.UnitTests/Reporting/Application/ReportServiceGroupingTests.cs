using Backend.UnitTests.Fakes;

using Contracts;

using Reporting.Application;

namespace Backend.UnitTests.Reporting.Application;

public sealed class ReportServiceGroupingTests
{
    private static readonly Guid Dev1 = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Dev2 = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ProjectA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid ProjectB = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    [Fact]
    public async Task TeamReportGroupsTotalsByDeveloperAndByProject()
    {
        var entries = new List<WorkEntryRow>
        {
            Entry(Dev1, ProjectA, DomainRules.TaskCompleted, hours: 4),
            Entry(Dev1, ProjectB, DomainRules.TaskInProgress, hours: 2),
            Entry(Dev2, ProjectA, DomainRules.TaskCompleted, hours: null),
        };

        var reader = new FakeWorkEntryReader(entries);
        var team = new FakeTeamDirectory();
        team.SeedDeveloper(Dev1, "Alice");
        team.SeedDeveloper(Dev2, "Bob");

        var service = new ReportService(
            reader,
            team,
            new ReportAccessScopeFactory(
                new FakeCurrentUser { Role = DomainRules.RoleAdmin },
                team));

        var report = await service.GetTeamReportAsync("2026-01-01", "2026-01-31", null, CancellationToken.None);

        report.Developers.Should().HaveCount(2);
        report.Developers.Should().Contain(developer => developer.DeveloperId == Dev1 && developer.Entries == 2);
        report.Developers.Should().Contain(developer => developer.DeveloperId == Dev2 && developer.Entries == 1);

        report.Projects.Should().HaveCount(2);
        report.Projects.Should().Contain(project => project.ProjectId == ProjectA && project.Contributors == 2);
    }

    [Fact]
    public async Task TeamReportFiltersEntriesToRequestedDateRange()
    {
        var entries = new List<WorkEntryRow>
        {
            Entry(Dev1, ProjectA, DomainRules.TaskCompleted, new DateOnly(2026, 1, 5), 4),
            Entry(Dev1, ProjectA, DomainRules.TaskCompleted, new DateOnly(2026, 2, 5), 4),
        };

        var reader = new FakeWorkEntryReader(entries);
        var team = new FakeTeamDirectory();
        team.SeedDeveloper(Dev1, "Alice");

        var service = new ReportService(
            reader,
            team,
            new ReportAccessScopeFactory(
                new FakeCurrentUser { Role = DomainRules.RoleAdmin },
                team));

        var report = await service.GetTeamReportAsync("2026-01-01", "2026-01-31", null, CancellationToken.None);

        report.Statuses.Total.Should().Be(1);
    }

    private static WorkEntryRow Entry(
        Guid developerId,
        Guid projectId,
        string status,
        DateOnly? date = null,
        decimal? hours = 8) =>
        new(
            Guid.CreateVersion7(),
            developerId,
            projectId,
            null,
            date ?? new DateOnly(2026, 1, 10),
            "Task",
            status,
            "medium",
            0,
            hours,
            null,
            false);

    private sealed class FakeWorkEntryReader(IReadOnlyList<WorkEntryRow> rows) : IWorkEntryReader
    {
        public Task<IReadOnlyList<WorkEntryRow>> ListAsync(
            DateOnly from,
            DateOnly to,
            Guid? projectId,
            IReadOnlyList<Guid>? developerIds,
            CancellationToken cancellationToken = default)
        {
            var filtered = rows.Where(entry =>
                entry.EntryDate >= from
                && entry.EntryDate <= to
                && (projectId is null || entry.ProjectId == projectId)
                && (developerIds is null || developerIds.Contains(entry.DeveloperId)));

            return Task.FromResult<IReadOnlyList<WorkEntryRow>>([.. filtered]);
        }
    }

}
