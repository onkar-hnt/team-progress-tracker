using Backend.UnitTests.Fakes;

using Contracts;

using Identity.Application;
using Identity.Domain;

namespace Backend.UnitTests.Identity.Application;

public sealed class ChangePasswordTemporaryPasswordTests
{
    [Fact]
    public async Task ChangePasswordRejectsTheHandedOutTemporaryPassword()
    {
        var profileId = Guid.CreateVersion7();
        var profiles = new FakeProfileRepository();
        profiles.Seed(new Profile
        {
            Id = profileId,
            Email = "dev@example.com",
            DisplayName = "Alice Smith",
            Role = DomainRules.RoleDeveloper,
            Status = DomainRules.ProfileActive,
            MustChangePassword = true,
            PasswordHash = "hash:Alice@123",
        });

        var service = AuthServiceFactory.Create(
            profiles,
            new FakeCurrentUser { ProfileId = profileId });

        var act = () => service.ChangePasswordAsync(
            new ChangePasswordRequest { NewPassword = "Alice@123" },
            CancellationToken.None);

        var exception = await act.Should().ThrowAsync<ValidationFailedException>();
        exception.Which.Message.Should().Be("Choose a password of your own.");
        exception.Which.Errors.Should().Contain("That is the password you were given. Pick a different one.");
    }

    [Fact]
    public async Task ChangePasswordAcceptsANewPasswordThatIsNotTheTemporaryOne()
    {
        var profileId = Guid.CreateVersion7();
        var profiles = new FakeProfileRepository();
        profiles.Seed(new Profile
        {
            Id = profileId,
            Email = "dev@example.com",
            DisplayName = "Alice Smith",
            Role = DomainRules.RoleDeveloper,
            Status = DomainRules.ProfileActive,
            MustChangePassword = true,
            PasswordHash = "hash:Alice@123",
        });

        var service = AuthServiceFactory.Create(
            profiles,
            new FakeCurrentUser { ProfileId = profileId });

        var response = await service.ChangePasswordAsync(
            new ChangePasswordRequest { NewPassword = "MyOwnPass1" },
            CancellationToken.None);

        response.AccessToken.Should().Be("token");
        (await profiles.FindByIdAsync(profileId, CancellationToken.None))!
            .MustChangePassword.Should().BeFalse();
    }
}
