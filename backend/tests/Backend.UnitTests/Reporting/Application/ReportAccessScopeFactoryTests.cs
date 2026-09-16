using Backend.UnitTests.Fakes;

using Reporting.Application;

namespace Backend.UnitTests.Reporting.Application;

public sealed class ReportAccessScopeFactoryTests
{
    [Fact]
    public async Task MentorWhoIsAlsoDeveloperCanViewOwnDeveloperRow()
    {
        var ownDeveloperId = Guid.CreateVersion7();
        var assignedId = Guid.CreateVersion7();
        var mentorId = Guid.CreateVersion7();

        var directory = new FakeTeamDirectory();
        directory.SeedAssignedDevelopers(mentorId, assignedId);

        var factory = new ReportAccessScopeFactory(
            new FakeCurrentUser
            {
                Role = DomainRules.RoleMentor,
                MentorId = mentorId,
                DeveloperId = ownDeveloperId,
            },
            directory);

        var scope = await factory.CreateAsync(CancellationToken.None);

        var outsideId = Guid.CreateVersion7();

        scope.CanViewDeveloper(ownDeveloperId).Should().BeTrue();
        scope.CanViewDeveloper(assignedId).Should().BeTrue();
        scope.CanViewDeveloper(outsideId).Should().BeFalse();
    }
}
