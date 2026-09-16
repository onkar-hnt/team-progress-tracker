using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class AuthenticationWorkflowTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Signing_in_with_valid_credentials_returns_a_token_and_user_profile()
    {
        var client = environment.IdentityClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new SignInRequest
            {
                Email = TestConfiguration.AdminEmail,
                Password = TestConfiguration.AdminPassword,
            },
            Json);

        var session = await ApiEnvelopeReader.ReadDataAsync<SignInResponse>(response);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        session.AccessToken.Should().NotBeNullOrWhiteSpace();
        session.User.Email.Should().Be(TestConfiguration.AdminEmail);
        session.User.Role.Should().Be("admin");
        session.User.MustChangePassword.Should().BeFalse();
    }

    [Fact]
    public async Task Signing_in_with_the_wrong_password_is_refused_with_the_same_message_as_an_unknown_email()
    {
        var client = environment.IdentityClient();

        var wrongPassword = await client.PostAsJsonAsync(
            "/api/auth/login",
            new SignInRequest { Email = TestConfiguration.AdminEmail, Password = "NotTheAdminPassword1!" },
            Json);

        var unknownEmail = await client.PostAsJsonAsync(
            "/api/auth/login",
            new SignInRequest { Email = "nobody@test.local", Password = "Anything123!" },
            Json);

        var wrongEnvelope = await ApiEnvelopeReader.ExpectFailureAsync(wrongPassword, HttpStatusCode.Unauthorized);
        var unknownEnvelope = await ApiEnvelopeReader.ExpectFailureAsync(unknownEmail, HttpStatusCode.Unauthorized);

        wrongEnvelope.Message.Should().Be(unknownEnvelope.Message);
        wrongEnvelope.Message.Should().Be("That email and password do not match.");
    }

    [Fact]
    public async Task Signing_in_with_a_deactivated_login_is_refused_with_an_explanation()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var developer = await roster.CreateDeveloperAsync(project.Id);
        var (provisioned, _, _) = await roster.ProvisionDeveloperLoginAsync(developer);

        var accounts = await roster.AdminIdentity.GetAsync("/api/accounts");
        accounts.EnsureSuccessStatusCode();

        var deactivate = await roster.AdminIdentity.PostAsJsonAsync(
            "/api/accounts/state",
            new SetAccountStateRequest { ProfileId = provisioned.ProfileId, State = "inactive" },
            Json);
        deactivate.EnsureSuccessStatusCode();

        var client = environment.IdentityClient();
        var response = await client.PostAsJsonAsync(
            "/api/auth/login",
            new SignInRequest { Email = provisioned.Email, Password = provisioned.TemporaryPassword },
            Json);

        var envelope = await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.Forbidden);
        envelope.Message.Should().Contain("deactivated");
    }

    [Fact]
    public async Task Get_auth_me_restores_the_signed_in_session_from_the_database()
    {
        var client = environment.IdentityClient();
        var (_, session) = await AuthClientFactory.SignInAsync(
            client,
            TestConfiguration.AdminEmail,
            TestConfiguration.AdminPassword);

        var response = await client.GetAsync("/api/auth/me");
        var me = await ApiEnvelopeReader.ReadDataAsync<AuthenticatedUserDto>(response);

        me.Email.Should().Be(session.User.Email);
        me.Name.Should().Be(session.User.Name);
        me.Role.Should().Be(session.User.Role);
    }

    [Fact]
    public async Task Forced_password_change_clears_the_flag_rejects_the_temporary_password_and_reissues_a_working_token()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var developer = await roster.CreateDeveloperAsync(project.Id);
        var (provisioned, firstSession, identityClient) = await roster.ProvisionDeveloperLoginAsync(developer);

        firstSession.User.MustChangePassword.Should().BeTrue();

        var rejectTemporary = await identityClient.PostAsJsonAsync(
            "/api/auth/change-password",
            new ChangePasswordRequest { NewPassword = provisioned.TemporaryPassword },
            Json);
        await ApiEnvelopeReader.ExpectFailureAsync(rejectTemporary, HttpStatusCode.BadRequest);

        var newPassword = $"NewPass{roster.UniqueTag}1";
        var change = await identityClient.PostAsJsonAsync(
            "/api/auth/change-password",
            new ChangePasswordRequest { NewPassword = newPassword },
            Json);

        var afterChange = await ApiEnvelopeReader.ReadDataAsync<SignInResponse>(change);
        afterChange.User.MustChangePassword.Should().BeFalse();
        afterChange.AccessToken.Should().NotBe(firstSession.AccessToken);

        var bare = environment.IdentityClient();
        var (_, refreshed) = await AuthClientFactory.SignInAsync(bare, provisioned.Email, newPassword);
        refreshed.User.MustChangePassword.Should().BeFalse();
        refreshed.User.DeveloperId.Should().Be(developer.Id);
    }
}
