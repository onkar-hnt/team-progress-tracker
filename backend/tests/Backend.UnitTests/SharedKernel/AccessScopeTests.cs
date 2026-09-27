namespace Backend.UnitTests.SharedKernel;

public sealed class AccessScopeTests
{
    private static readonly Guid DevA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid DevB = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid DevC = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid ProjectOne = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid ProjectTwo = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

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

    [Fact]
    public void AdminIsNotNarrowedByProject()
    {
        var scope = AccessScope.ForAdmin(null, null);

        scope.ReadsEveryProject.Should().BeTrue();
        scope.CanRequestProject(ProjectOne).Should().BeTrue();
        scope.CanViewDeveloperProject(DevA, ProjectOne).Should().BeTrue();
        scope.RestrictProjectIds(null).Should().BeNull();
    }

    [Fact]
    public void MentorSeesAssignedDeveloperOnlyOnAProjectTheyAreResponsibleFor()
    {
        var scope = MentorOf(ProjectOne);

        scope.CanViewDeveloperProject(DevB, ProjectOne).Should().BeTrue();
        scope.CanViewDeveloperProject(DevB, ProjectTwo).Should().BeFalse();
    }

    [Fact]
    public void MentorDoesNotSeeAnUnassignedDeveloperEvenOnTheirOwnProject()
    {
        var scope = MentorOf(ProjectOne);

        scope.CanViewDeveloperProject(DevC, ProjectOne).Should().BeFalse();
    }

    /// <summary>
    /// A row with no project is not another project's data: general feedback
    /// stays with every mentor assigned to the employee.
    /// </summary>
    [Fact]
    public void WorkWithNoProjectStaysVisibleToAnAssignedMentor()
    {
        var scope = MentorOf(ProjectOne);

        scope.CanViewDeveloperProject(DevB, null).Should().BeTrue();
    }

    [Fact]
    public void OwnWorkIsNeverNarrowedByProject()
    {
        var scope = MentorOf(ProjectOne);

        scope.CanViewDeveloperProject(DevA, ProjectTwo).Should().BeTrue();
    }

    [Fact]
    public void MentorResponsibleForNothingSeesNoOneElsesProjectWork()
    {
        var scope = new AccessScope(
            DomainRules.RoleMentor,
            DevA,
            Guid.NewGuid(),
            new HashSet<Guid> { DevA, DevB },
            new HashSet<Guid>());

        scope.CanViewDeveloperProject(DevB, ProjectOne).Should().BeFalse();
        scope.CanViewDeveloperProject(DevB, null).Should().BeTrue();
        scope.CanViewDeveloperProject(DevA, ProjectOne).Should().BeTrue();
    }

    [Fact]
    public void MentorAskingForEveryProjectIsAnsweredWithTheirOwn()
    {
        var scope = MentorOf(ProjectOne);

        scope.RestrictProjectIds(null).Should().Equal(ProjectOne);
    }

    [Fact]
    public void RequestedProjectsAreIntersectedWithTheMentorsOwn()
    {
        var scope = MentorOf(ProjectOne);

        scope.RestrictProjectIds([ProjectOne, ProjectTwo]).Should().Equal(ProjectOne);
        scope.RestrictProjectIds([ProjectTwo]).Should().BeEmpty();
    }

    [Fact]
    public void RequireDeveloperProjectVisibleSaysWhichBoundaryWasCrossed()
    {
        var scope = MentorOf(ProjectOne);

        var outsideProject = () => scope.RequireDeveloperProjectVisible(DevB, ProjectTwo);
        var outsideRoster = () => scope.RequireDeveloperProjectVisible(DevC, ProjectOne);

        outsideProject.Should().Throw<ForbiddenException>()
            .WithMessage("That work is on a project you are not responsible for.");
        outsideRoster.Should().Throw<ForbiddenException>()
            .WithMessage("That employee is outside the people you can see.");
    }

    /// <summary>A mentor assigned to DevA and DevB, responsible for one project.</summary>
    private static AccessScope MentorOf(Guid projectId) =>
        new(
            DomainRules.RoleMentor,
            DevA,
            Guid.NewGuid(),
            new HashSet<Guid> { DevA, DevB },
            new HashSet<Guid> { projectId });
}
