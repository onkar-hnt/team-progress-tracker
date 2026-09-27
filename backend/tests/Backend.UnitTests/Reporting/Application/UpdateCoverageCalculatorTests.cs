using Contracts;

using Reporting.Application;

namespace Backend.UnitTests.Reporting.Application;

public sealed class UpdateCoverageCalculatorTests
{
    private static readonly Guid Dev = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Other = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Project = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    // Monday 28 September 2026 to Friday 2 October: five working days.
    private static readonly DateOnly Monday = new(2026, 9, 28);
    private static readonly DateOnly Friday = new(2026, 10, 2);

    [Fact]
    public void EveryWorkingDayInRangeIsAskedAbout()
    {
        var coverage = Build();

        coverage.Developers.Should().HaveCount(1);
        coverage.Developers[0].Days.Should().HaveCount(5);
    }

    [Fact]
    public void WeekendsAreNotAskedAbout()
    {
        var coverage = Build(to: new DateOnly(2026, 10, 4));

        coverage.Developers[0].Days.Select(day => day.Date)
            .Should().NotContain("2026-10-03").And.NotContain("2026-10-04");
    }

    [Fact]
    public void DaysReadNewestFirst()
    {
        var coverage = Build();

        coverage.Developers[0].Days.Select(day => day.Date).Should().Equal(
            "2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29", "2026-09-28");
    }

    [Fact]
    public void ADayWithNoUpdateAndNoLeaveIsAGap()
    {
        var coverage = Build();

        coverage.Developers[0].MissingCount.Should().Be(5);
        coverage.Developers[0].Days.Should().OnlyContain(
            day => day.State == UpdateCoverageCalculator.StateMissing);
    }

    [Fact]
    public void AnUpdateAnswersTheDay()
    {
        var coverage = Build(entries: [Entry(Dev, Monday)]);

        coverage.Developers[0].SubmittedCount.Should().Be(1);
        coverage.Developers[0].MissingCount.Should().Be(4);
        coverage.Developers[0].MissingDates.Should().NotContain("2026-09-28");
    }

    /// <summary>
    /// Several entries may share a day; the question is only whether one exists.
    /// </summary>
    [Fact]
    public void TwoUpdatesOnOneDayStillAnswerOneDay()
    {
        var coverage = Build(entries: [Entry(Dev, Monday), Entry(Dev, Monday)]);

        coverage.Developers[0].SubmittedCount.Should().Be(1);
        coverage.Developers[0].MissingCount.Should().Be(4);
    }

    [Fact]
    public void LeaveAnswersTheDayToo()
    {
        var coverage = Build(leaveDays: [new LeaveDayRow(Dev, Monday, "Annual leave.")]);

        var day = coverage.Developers[0].Days.Single(row => row.Date == "2026-09-28");

        day.State.Should().Be(UpdateCoverageCalculator.StateLeave);
        day.Note.Should().Be("Annual leave.");
        coverage.Developers[0].LeaveCount.Should().Be(1);
        coverage.Developers[0].MissingCount.Should().Be(4);
    }

    /// <summary>
    /// An update and a leave day on the same date should not happen, but if it
    /// does the update wins: work that was reported is not a day off.
    /// </summary>
    [Fact]
    public void AnUpdateBeatsALeaveDayOnTheSameDate()
    {
        var coverage = Build(
            entries: [Entry(Dev, Monday)],
            leaveDays: [new LeaveDayRow(Dev, Monday, null)]);

        coverage.Developers[0].Days.Single(row => row.Date == "2026-09-28")
            .State.Should().Be(UpdateCoverageCalculator.StateSubmitted);
    }

    [Fact]
    public void TheLastSubmittedDayIsTheMostRecentOne()
    {
        var coverage = Build(entries: [Entry(Dev, Monday), Entry(Dev, new DateOnly(2026, 9, 30))]);

        coverage.Developers[0].LastSubmittedDate.Should().Be("2026-09-30");
    }

    [Fact]
    public void NobodyWhoHasSubmittedNothingHasALastSubmittedDay()
    {
        Build().Developers[0].LastSubmittedDate.Should().BeNull();
    }

    [Fact]
    public void AnotherPersonsUpdateDoesNotAnswerYourDay()
    {
        var coverage = Build(entries: [Entry(Other, Monday)]);

        coverage.Developers[0].MissingCount.Should().Be(5);
    }

    [Fact]
    public void InactiveEmployeesAreNotAskedForUpdates()
    {
        var coverage = Build(developers: [Developer(Dev, active: false)]);

        coverage.Developers.Should().BeEmpty();
    }

    [Theory]
    [InlineData(DomainRules.RoleAdmin)]
    [InlineData(DomainRules.RoleMentor)]
    public void AdministratorsAndMentorsDoNotSubmitDailyUpdates(string accessRole)
    {
        var coverage = Build(developers: [Developer(Dev, accessRole: accessRole)]);

        coverage.Developers.Should().BeEmpty();
    }

    [Fact]
    public void AnEmployeeWithNoAccessRoleSetIsStillAskedForUpdates()
    {
        var coverage = Build(developers: [Developer(Dev, accessRole: null)]);

        coverage.Developers.Should().HaveCount(1);
    }

    [Fact]
    public void TotalsCountThePeopleBehindAndTheDaysTheyOwe()
    {
        var coverage = Build(
            developers: [Developer(Dev), Developer(Other)],
            entries: [Entry(Other, Monday)],
            leaveDays: [new LeaveDayRow(Other, Friday, null)]);

        coverage.Totals.DevelopersWithGaps.Should().Be(2);
        coverage.Totals.MissingDays.Should().Be(5 + 3);
        coverage.Totals.LeaveDays.Should().Be(1);
    }

    [Fact]
    public void SomebodyWhoAccountedForEveryDayIsNotBehind()
    {
        var entries = DomainRules.ListWorkingDates(Monday, Friday)
            .Select(date => Entry(Dev, date))
            .ToList();

        var coverage = Build(entries: entries);

        coverage.Totals.DevelopersWithGaps.Should().Be(0);
        coverage.Totals.MissingDays.Should().Be(0);
    }

    [Fact]
    public void TheRangeIsReportedBackAsItWasAsked()
    {
        var coverage = Build();

        coverage.From.Should().Be("2026-09-28");
        coverage.To.Should().Be("2026-10-02");
    }

    private static UpdateCoverageDto Build(
        DateOnly? from = null,
        DateOnly? to = null,
        IReadOnlyList<RosterDeveloper>? developers = null,
        IReadOnlyList<WorkEntryRow>? entries = null,
        IReadOnlyList<LeaveDayRow>? leaveDays = null) =>
        UpdateCoverageCalculator.Build(
            from ?? Monday,
            to ?? Friday,
            developers ?? [Developer(Dev)],
            entries ?? [],
            leaveDays ?? []);

    private static RosterDeveloper Developer(
        Guid id,
        bool active = true,
        string? accessRole = DomainRules.RoleDeveloper) =>
        new(id, $"Developer {id.ToString()[..4]}", Guid.NewGuid(), active, null, accessRole);

    private static WorkEntryRow Entry(Guid developerId, DateOnly date) =>
        new(
            Guid.CreateVersion7(),
            developerId,
            Project,
            null,
            date,
            "Task",
            DomainRules.TaskInProgress,
            "medium",
            0,
            null,
            null,
            false);
}
