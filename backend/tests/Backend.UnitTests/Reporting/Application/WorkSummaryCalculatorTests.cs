using Reporting.Application;

namespace Backend.UnitTests.Reporting.Application;

public sealed class WorkSummaryCalculatorTests
{
    private static readonly Guid Dev1 = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Dev2 = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid ProjectA = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    [Fact]
    public void SummariseStatusesCountsEachStatus()
    {
        var entries = new[]
        {
            Row(Dev1, DomainRules.TaskCompleted),
            Row(Dev1, DomainRules.TaskInProgress),
            Row(Dev1, DomainRules.TaskBlocked),
        };

        var summary = WorkSummaryCalculator.SummariseStatuses(entries);

        summary.Total.Should().Be(3);
        summary.Completed.Should().Be(1);
        summary.InProgress.Should().Be(1);
        summary.Blocked.Should().Be(1);
    }

    [Fact]
    public void CompletionRateRoundsToNearestWholePercent()
    {
        var entries = new[]
        {
            Row(Dev1, DomainRules.TaskCompleted),
            Row(Dev1, DomainRules.TaskInProgress),
            Row(Dev1, DomainRules.TaskInProgress),
        };

        WorkSummaryCalculator.CompletionRate(entries).Should().Be(33);
    }

    [Fact]
    public void SumHoursLoggedUsesStandardDayWhenNoHoursReportedForADay()
    {
        var entries = new[]
        {
            Row(Dev1, DomainRules.TaskInProgress, new DateOnly(2026, 3, 1), null),
            Row(Dev1, DomainRules.TaskInProgress, new DateOnly(2026, 3, 2), 4),
        };

        WorkSummaryCalculator.SumHoursLogged(entries).Should().Be(12);
    }

    [Fact]
    public void SumHoursLoggedAggregatesPerDeveloperPerDay()
    {
        var entries = new[]
        {
            Row(Dev1, DomainRules.TaskInProgress, new DateOnly(2026, 3, 1), 2),
            Row(Dev1, DomainRules.TaskInProgress, new DateOnly(2026, 3, 1), 3),
            Row(Dev2, DomainRules.TaskInProgress, new DateOnly(2026, 3, 1), 1),
        };

        WorkSummaryCalculator.SumHoursLogged(entries).Should().Be(6);
    }

    private static WorkEntryRow Row(
        Guid developerId,
        string status,
        DateOnly? date = null,
        decimal? hours = 8) =>
        new(
            Guid.CreateVersion7(),
            developerId,
            ProjectA,
            null,
            date ?? new DateOnly(2026, 3, 1),
            "Task",
            status,
            "medium",
            0,
            hours,
            null,
            false);
}
