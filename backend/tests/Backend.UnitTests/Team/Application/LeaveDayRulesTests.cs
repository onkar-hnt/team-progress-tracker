using Team.Application;

namespace Backend.UnitTests.Team.Application;

public sealed class LeaveDayRulesTests
{
    private static readonly Guid Own = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Other = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly DateOnly Today = new(2026, 9, 28);

    [Fact]
    public void APastDayCanBeAccountedFor()
    {
        LeaveDayRules.IsWithinReach(Today.AddDays(-30), Today).Should().BeTrue();
    }

    [Fact]
    public void TodayCanBeAccountedFor()
    {
        LeaveDayRules.IsWithinReach(Today, Today).Should().BeTrue();
    }

    /// <summary>
    /// Tomorrow is allowed because the browser works in the reader's own
    /// calendar day and the server counts in UTC: an evening in a zone ahead of
    /// UTC is already the next date locally.
    /// </summary>
    [Fact]
    public void TomorrowCanBeAccountedForSoTimeZonesAheadOfUtcAreNotRefused()
    {
        LeaveDayRules.IsWithinReach(Today.AddDays(1), Today).Should().BeTrue();
    }

    [Fact]
    public void BeyondTomorrowIsRefusedAsATypo()
    {
        LeaveDayRules.IsWithinReach(Today.AddDays(2), Today).Should().BeFalse();

        var act = () => LeaveDayRules.RequireWithinReach(Today.AddDays(2), Today);

        act.Should().Throw<ValidationFailedException>()
            .WithMessage("That date is too far ahead to mark as leave.");
    }

    [Fact]
    public void ADeveloperAccountsForTheirOwnDays()
    {
        LeaveDayRules.CanWriteFor(Developer(Own), Own).Should().BeTrue();
    }

    [Fact]
    public void ADeveloperCannotAccountForSomebodyElsesDay()
    {
        LeaveDayRules.CanWriteFor(Developer(Own), Other).Should().BeFalse();
    }

    [Fact]
    public void AnAdministratorAccountsForAnybodysDay()
    {
        LeaveDayRules.CanWriteFor(AccessScope.ForAdmin(null, null), Other).Should().BeTrue();
    }

    /// <summary>
    /// Marking somebody as having been away is a statement about them, so it
    /// stays with the person themselves and with an administrator. A mentor who
    /// believes a day was leave asks for an update instead.
    /// </summary>
    [Fact]
    public void AMentorCannotMarkAnAssignedDeveloperAsHavingBeenOnLeave()
    {
        var mentor = new AccessScope(
            DomainRules.RoleMentor,
            null,
            Guid.NewGuid(),
            new HashSet<Guid> { Other });

        LeaveDayRules.CanWriteFor(mentor, Other).Should().BeFalse();

        var act = () => LeaveDayRules.RequireCanWriteFor(mentor, Other);

        act.Should().Throw<ForbiddenException>()
            .WithMessage("Only that employee or an administrator can account for their day.");
    }

    private static AccessScope Developer(Guid developerId) =>
        new(DomainRules.RoleDeveloper, developerId, null, new HashSet<Guid> { developerId });
}
