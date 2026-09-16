namespace Backend.UnitTests.SharedKernel;

public sealed class AccessScopeTests
{
    private static readonly Guid DevA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid DevB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid DevC = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Fact]
    public void AdminScopeIsUnrestrictedAndCanViewAnyDeveloper()
    {
        var scope = AccessScope.ForAdmin(null, null);

        scope.IsUnrestricted.Should().BeTrue();
        scope.CanViewDeveloper(DevA).Should().BeTrue();
        scope.RestrictDeveloperIds(null).Should().BeNull();
    }

    [Fact]
    public void AdminRequestedFilterIsPassedThroughWhenNonEmpty()
    {
        var scope = AccessScope.ForAdmin(null, null);
        var filter = new[] { DevA, DevB };

        scope.RestrictDeveloperIds(filter).Should().Equal(filter);
    }

    [Fact]
    public void AdminEmptyRequestedFilterMeansNoFilter()
    {
        var scope = AccessScope.ForAdmin(null, null);

        scope.RestrictDeveloperIds([]).Should().BeNull();
    }

    [Fact]
    public void MentorWithNoRequestedFilterSeesOnlyAssignedDevelopers()
    {
        var visible = new HashSet<Guid> { DevA, DevB };
        var scope = new AccessScope(DomainRules.RoleMentor, null, Guid.NewGuid(), visible);

        scope.RestrictDeveloperIds(null).Should().Equal(DevA, DevB);
    }

    [Fact]
    public void MentorRequestedFilterIsIntersectedWithVisibleDevelopers()
    {
        var visible = new HashSet<Guid> { DevA, DevB };
        var scope = new AccessScope(DomainRules.RoleMentor, null, Guid.NewGuid(), visible);

        scope.RestrictDeveloperIds([DevB, DevC]).Should().Equal(DevB);
    }

    [Fact]
    public void MentorFilterThatMatchesNothingReturnsEmptyList()
    {
        var visible = new HashSet<Guid> { DevA };
        var scope = new AccessScope(DomainRules.RoleMentor, null, Guid.NewGuid(), visible);

        scope.RestrictDeveloperIds([DevC]).Should().BeEmpty();
    }

    [Fact]
    public void EmptyVisibleSetMeansNothingCanBeViewed()
    {
        var scope = new AccessScope(DomainRules.RoleMentor, null, Guid.NewGuid(), new HashSet<Guid>());

        scope.CanViewDeveloper(DevA).Should().BeFalse();
        scope.RestrictDeveloperIds(null).Should().BeEmpty();
    }

    [Fact]
    public void RequireDeveloperVisibleThrowsWhenDeveloperIsOutsideScope()
    {
        var scope = new AccessScope(DomainRules.RoleDeveloper, DevA, null, new HashSet<Guid> { DevA });

        var act = () => scope.RequireDeveloperVisible(DevB);

        act.Should().Throw<ForbiddenException>()
            .WithMessage("That employee is outside the people you can see.");
    }

    [Fact]
    public void MentorWhoIsAlsoDeveloperSeesOwnRowAndAssignments()
    {
        var visible = new HashSet<Guid> { DevA, DevB };
        var scope = new AccessScope(DomainRules.RoleMentor, DevA, Guid.NewGuid(), visible);

        scope.CanViewDeveloper(DevA).Should().BeTrue();
        scope.CanViewDeveloper(DevB).Should().BeTrue();
        scope.CanViewDeveloper(DevC).Should().BeFalse();
    }
}
