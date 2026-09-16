using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

using SharedKernel;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class AuthorizationWorkflowTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_developer_cannot_list_every_login_account()
    {
        var scenario = await BuildStandardRosterAsync();

        var response = await scenario.DeveloperIdentity.GetAsync("/api/accounts");

        var envelope = await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.Forbidden);
        envelope.Message.Should().NotBeNullOrWhiteSpace();
        envelope.Status.Should().Be(403);
    }

    [Fact]
    public async Task A_developer_cannot_create_a_task_for_another_employee()
    {
        var scenario = await BuildStandardRosterAsync();
        var other = await scenario.Roster.CreateDeveloperAsync(scenario.Project.Id);

        var work = scenario.Roster.WorkClientFor(scenario.DeveloperIdentity);
        var response = await work.PostAsJsonAsync(
            "/api/tasks",
            new SaveTaskRequest
            {
                Name = "Someone else's task",
                ProjectId = scenario.Project.Id,
                DeveloperId = other.Id,
                Priority = "medium",
                Status = DomainRules.TaskNotStarted,
            },
            Json);

        await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task A_developer_cannot_fetch_another_employees_report_totals()
    {
        var scenario = await BuildStandardRosterAsync();
        var other = await scenario.Roster.CreateDeveloperAsync(scenario.Project.Id);

        var reporting = scenario.Roster.ReportingClientFor(scenario.DeveloperIdentity);
        var response = await reporting.GetAsync($"/api/reports/developers/{other.Id}?from=2026-01-01&to=2026-01-31");

        await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.Forbidden);
    }

    /// <summary>
    /// A mentor manages employees and assignments, so they read the whole
    /// roster - including people not assigned to them, who they may be about to
    /// assign. What stays scoped is the work: a mentor cannot read the record of
    /// somebody they do not mentor.
    /// </summary>
    [Fact]
    public async Task A_mentor_reads_the_roster_but_not_an_unassigned_employees_work()
    {
        var scenario = await BuildStandardRosterAsync();
        var assigned = await scenario.Roster.CreateDeveloperAsync(scenario.Project.Id);
        var unassigned = await scenario.Roster.CreateDeveloperAsync(scenario.Project.Id);

        await scenario.Roster.AssignMentorAsync(scenario.Mentor.Id, assigned.Id);

        var mentorTeam = scenario.Roster.TeamClientFor(scenario.MentorIdentity);
        var developers = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<DeveloperDto>>(
            await mentorTeam.GetAsync("/api/developers"));

        developers.Select(row => row.Id).Should().Contain(assigned.Id);
        developers.Select(row => row.Id).Should().Contain(unassigned.Id);

        var mentorReporting = scenario.Roster.ReportingClientFor(scenario.MentorIdentity);

        _ = await ApiEnvelopeReader.ReadDataAsync<DeveloperTotalsDto>(
            await mentorReporting.GetAsync(
                $"/api/reports/developers/{assigned.Id}?from=2026-01-01&to=2026-01-31"));

        await ApiEnvelopeReader.ExpectFailureAsync(
            await mentorReporting.GetAsync(
                $"/api/reports/developers/{unassigned.Id}?from=2026-01-01&to=2026-01-31"),
            HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task An_administrator_can_list_every_developer_and_every_login()
    {
        var scenario = await BuildStandardRosterAsync();

        var teamResponse = await scenario.Roster.AdminTeam.GetAsync("/api/developers");
        var developers = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<DeveloperDto>>(teamResponse);
        developers.Should().NotBeEmpty();

        var accountsResponse = await scenario.Roster.AdminIdentity.GetAsync("/api/accounts");
        var accounts = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<AccountDto>>(accountsResponse);
        accounts.Should().Contain(account => account.Email == TestConfiguration.AdminEmail);
    }

    [Fact]
    public async Task An_administrator_can_open_the_team_report_while_a_developer_cannot()
    {
        var scenario = await BuildStandardRosterAsync();

        var adminReport = await scenario.Roster.AdminReporting.GetAsync("/api/reports/team?from=2026-01-01&to=2026-01-31");
        adminReport.EnsureSuccessStatusCode();

        var developerReport = await scenario.Roster.ReportingClientFor(scenario.DeveloperIdentity)
            .GetAsync("/api/reports/team?from=2026-01-01&to=2026-01-31");

        await ApiEnvelopeReader.ExpectFailureAsync(developerReport, HttpStatusCode.Forbidden);
    }

    private async Task<StandardRoster> BuildStandardRosterAsync()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var developer = await roster.CreateDeveloperAsync(project.Id);
        var mentor = await roster.CreateMentorAsync();

        var (devProvisioned, _, devIdentity) = await roster.ProvisionDeveloperLoginAsync(developer);
        var (mentorProvisioned, _, mentorIdentity) = await roster.ProvisionMentorLoginAsync(mentor);

        var developerPassword = await ForcePasswordChangeAsync(devIdentity, roster.UniqueTag);
        var mentorPassword = await ForcePasswordChangeAsync(mentorIdentity, roster.UniqueTag);

        await roster.AssignMentorAsync(mentor.Id, developer.Id);

        var (developerIdentity, _) = await AuthClientFactory.SignInAsync(
            environment.IdentityClient(),
            devProvisioned.Email,
            developerPassword);

        var (mentorIdentityClient, _) = await AuthClientFactory.SignInAsync(
            environment.IdentityClient(),
            mentorProvisioned.Email,
            mentorPassword);

        return new StandardRoster(
            roster,
            project,
            developer,
            mentor,
            developerIdentity,
            mentorIdentityClient);
    }

    private static async Task<string> ForcePasswordChangeAsync(HttpClient identityClient, string uniqueTag)
    {
        var password = $"NewPass{uniqueTag}1";
        var change = await identityClient.PostAsJsonAsync(
            "/api/auth/change-password",
            new ChangePasswordRequest { NewPassword = password },
            Json);

        change.EnsureSuccessStatusCode();
        return password;
    }

    private sealed record StandardRoster(
        TestRosterBuilder Roster,
        ProjectDto Project,
        DeveloperDto Developer,
        MentorDto Mentor,
        HttpClient DeveloperIdentity,
        HttpClient MentorIdentity);
}
