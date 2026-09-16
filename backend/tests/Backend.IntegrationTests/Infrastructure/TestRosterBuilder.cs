using System.Net.Http.Json;
using System.Text.Json;

using Contracts;

using FluentAssertions;

using SharedKernel;

namespace Backend.IntegrationTests.Infrastructure;

public sealed class TestRosterBuilder(
    IntegrationTestEnvironment environment,
    HttpClient adminIdentity,
    HttpClient adminTeam)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task<TestRosterBuilder> CreateAdminAsync(IntegrationTestEnvironment environment)
    {
        var identity = environment.IdentityClient();
        var (adminIdentity, _) = await AuthClientFactory.SignInAsync(
            identity,
            TestConfiguration.AdminEmail,
            TestConfiguration.AdminPassword);

        var team = AuthClientFactory.CloneAuthorised(adminIdentity, environment.TeamClient());

        return new TestRosterBuilder(environment, adminIdentity, team);
    }

    public HttpClient AdminIdentity => adminIdentity;

    public HttpClient AdminTeam => adminTeam;

    public HttpClient AdminWork => AuthClientFactory.CloneAuthorised(adminIdentity, environment.WorkClient());

    public HttpClient AdminNotifications =>
        AuthClientFactory.CloneAuthorised(adminIdentity, environment.NotificationsClient());

    public HttpClient AdminReporting =>
        AuthClientFactory.CloneAuthorised(adminIdentity, environment.ReportingClient());

    public string UniqueTag { get; } = Guid.NewGuid().ToString("N")[..8];

    private int sequence;

    /// <summary>
    /// A fresh suffix for each row. The builder's tag on its own is not enough:
    /// a test that creates two developers would ask for the same email twice,
    /// and the roster refuses a duplicate.
    /// </summary>
    private string NextTag() => $"{UniqueTag}-{Interlocked.Increment(ref sequence)}";

    public async Task<ProjectDto> CreateProjectAsync(string? name = null, string? client = null)
    {
        var response = await adminTeam.PostAsJsonAsync(
            "/api/projects",
            new SaveProjectRequest
            {
                Name = name ?? $"Project {NextTag()}",
                Client = client ?? "Integration Client",
                Status = "active",
                Active = true,
            },
            Json);

        return await ApiEnvelopeReader.ReadDataAsync<ProjectDto>(response);
    }

    public async Task<MentorDto> CreateMentorAsync(string? email = null)
    {
        var tag = NextTag();

        var response = await adminTeam.PostAsJsonAsync(
            "/api/mentors",
            new SaveMentorRequest
            {
                Name = $"Mentor {tag}",
                Email = email ?? $"mentor-{tag}@test.local",
                Active = true,
            },
            Json);

        return await ApiEnvelopeReader.ReadDataAsync<MentorDto>(response);
    }

    public async Task<DeveloperDto> CreateDeveloperAsync(Guid? primaryProjectId = null, string? email = null)
    {
        var tag = NextTag();

        var response = await adminTeam.PostAsJsonAsync(
            "/api/developers",
            new SaveDeveloperRequest
            {
                Name = $"Developer {tag}",
                Email = email ?? $"developer-{tag}@test.local",
                Role = "Engineer",
                Location = "Manchester",
                AccessRole = DomainRules.RoleDeveloper,
                Active = true,
                PrimaryProjectId = primaryProjectId,
            },
            Json);

        return await ApiEnvelopeReader.ReadDataAsync<DeveloperDto>(response);
    }

    public async Task AssignMentorAsync(Guid mentorId, params Guid[] developerIds)
    {
        var response = await adminTeam.PutAsJsonAsync(
            $"/api/mentors/{mentorId}/assignments",
            new SetMentorAssignmentsRequest { DeveloperIds = developerIds },
            Json);

        response.EnsureSuccessStatusCode();
        _ = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<MentorAssignmentDto>>(response);
    }

    public async Task<(ProvisionLoginResponse Login, SignInResponse Session, HttpClient Client)> ProvisionDeveloperLoginAsync(
        DeveloperDto developer)
    {
        var response = await adminIdentity.PostAsJsonAsync(
            "/api/accounts/provision",
            new ProvisionLoginRequest { RowId = developer.Id, Table = "developers" },
            Json);

        var provisioned = await ApiEnvelopeReader.ReadDataAsync<ProvisionLoginResponse>(response);

        var bareIdentity = environment.IdentityClient();
        var (client, session) = await AuthClientFactory.SignInAsync(
            bareIdentity,
            provisioned.Email,
            provisioned.TemporaryPassword);

        return (provisioned, session, client);
    }

    public async Task<(ProvisionLoginResponse Login, SignInResponse Session, HttpClient Client)> ProvisionMentorLoginAsync(
        MentorDto mentor)
    {
        var response = await adminIdentity.PostAsJsonAsync(
            "/api/accounts/provision",
            new ProvisionLoginRequest { RowId = mentor.Id, Table = "mentors", Email = mentor.Email },
            Json);

        var provisioned = await ApiEnvelopeReader.ReadDataAsync<ProvisionLoginResponse>(response);

        var bareIdentity = environment.IdentityClient();
        var (client, session) = await AuthClientFactory.SignInAsync(
            bareIdentity,
            provisioned.Email,
            provisioned.TemporaryPassword);

        return (provisioned, session, client);
    }

    public HttpClient TeamClientFor(HttpClient identitySession) =>
        AuthClientFactory.CloneAuthorised(identitySession, environment.TeamClient());

    public HttpClient WorkClientFor(HttpClient identitySession) =>
        AuthClientFactory.CloneAuthorised(identitySession, environment.WorkClient());

    public HttpClient NotificationsClientFor(HttpClient identitySession) =>
        AuthClientFactory.CloneAuthorised(identitySession, environment.NotificationsClient());

    public HttpClient ReportingClientFor(HttpClient identitySession) =>
        AuthClientFactory.CloneAuthorised(identitySession, environment.ReportingClient());
}
