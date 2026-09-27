namespace Backend.UnitTests.SharedKernel;

/// <summary>
/// Working days have to agree with WORKING_WEEKDAYS in
/// src/constants/team.constants.ts, because the browser decides which day to
/// ask about and the server decides which days were missed.
/// </summary>
public sealed class WorkingDayTests
{
    [Theory]
    [InlineData(2026, 9, 28)] // Monday
    [InlineData(2026, 9, 29)]
    [InlineData(2026, 9, 30)]
    [InlineData(2026, 10, 1)]
    [InlineData(2026, 10, 2)] // Friday
    public void WeekdaysAreWorkingDays(int year, int month, int day)
    {
        DomainRules.IsWorkingDay(new DateOnly(year, month, day)).Should().BeTrue();
    }

    [Theory]
    [InlineData(2026, 10, 3)] // Saturday
    [InlineData(2026, 10, 4)] // Sunday
    public void WeekendsAreNot(int year, int month, int day)
    {
        DomainRules.IsWorkingDay(new DateOnly(year, month, day)).Should().BeFalse();
    }

    [Fact]
    public void AWeekIsFiveWorkingDaysOldestFirst()
    {
        var dates = DomainRules.ListWorkingDates(new DateOnly(2026, 9, 28), new DateOnly(2026, 10, 4));

        dates.Should().Equal(
            new DateOnly(2026, 9, 28),
            new DateOnly(2026, 9, 29),
            new DateOnly(2026, 9, 30),
            new DateOnly(2026, 10, 1),
            new DateOnly(2026, 10, 2));
    }

    [Fact]
    public void ASingleDayRangeIsInclusive()
    {
        DomainRules.ListWorkingDates(new DateOnly(2026, 9, 28), new DateOnly(2026, 9, 28))
            .Should().Equal(new DateOnly(2026, 9, 28));
    }

    [Fact]
    public void AWeekendOnlyRangeAsksAboutNothing()
    {
        DomainRules.ListWorkingDates(new DateOnly(2026, 10, 3), new DateOnly(2026, 10, 4))
            .Should().BeEmpty();
    }

    [Fact]
    public void ABackwardsRangeAsksAboutNothingRatherThanThrowing()
    {
        DomainRules.ListWorkingDates(new DateOnly(2026, 10, 2), new DateOnly(2026, 9, 28))
            .Should().BeEmpty();
    }
}
