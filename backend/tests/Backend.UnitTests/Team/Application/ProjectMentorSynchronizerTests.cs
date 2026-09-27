using Team.Application;

namespace Backend.UnitTests.Team.Application;

public sealed class ProjectMentorSynchronizerTests
{
    private static readonly Guid Primary = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid Second = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid Author = Guid.Parse("33333333-3333-3333-3333-333333333333");

    [Fact]
    public void ProjectWithNobodyNamedHasNoResponsibleMentors()
    {
        ProjectMentorSynchronizer.ForCreate(null, null, null).Should().BeEmpty();
    }

    /// <summary>
    /// A write that only sets the primary mentor still has to grant them the
    /// project, or it disappears from the list they are allowed to read.
    /// </summary>
    [Fact]
    public void PrimaryMentorIsResponsibleEvenWhenNobodyAskedForThem()
    {
        ProjectMentorSynchronizer.ForCreate(null, Primary, null).Should().Equal(Primary);
    }

    [Fact]
    public void PrimaryMentorLeadsTheStoredOrder()
    {
        ProjectMentorSynchronizer.ForCreate([Second, Primary], Primary, null)
            .Should().Equal(Primary, Second);
    }

    [Fact]
    public void MentorCreatingAProjectBecomesResponsibleForIt()
    {
        ProjectMentorSynchronizer.ForCreate([Second], null, Author)
            .Should().Equal(Second, Author);
    }

    [Fact]
    public void NobodyIsListedTwice()
    {
        ProjectMentorSynchronizer.ForCreate([Primary, Second, Primary], Primary, Primary)
            .Should().Equal(Primary, Second);
    }

    [Fact]
    public void EditingAProjectDoesNotMakeTheEditorResponsible()
    {
        ProjectMentorSynchronizer.ForUpdate([Second], null).Should().Equal(Second);
    }

    [Fact]
    public void ReplacingTheListStillKeepsTheProjectsOwnMentor()
    {
        ProjectMentorSynchronizer.ForUpdate([Second], Primary).Should().Equal(Primary, Second);
    }

    [Fact]
    public void ClearingTheListLeavesOnlyTheProjectsOwnMentor()
    {
        ProjectMentorSynchronizer.ForUpdate([], Primary).Should().Equal(Primary);
    }
}
