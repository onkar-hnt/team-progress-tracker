using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

using SharedKernel;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class ReportingWorkflowTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Team_report_honours_the_date_range_project_filter_and_admin_visibility()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var projectA = await roster.CreateProjectAsync("Report project A");
        var projectB = await roster.CreateProjectAsync("Report project B");
        var developer = await roster.CreateDeveloperAsync(projectA.Id);

        var (provisioned, _, identity) = await roster.ProvisionDeveloperLoginAsync(developer);
        var password = $"NewPass{roster.UniqueTag}1";
        (await identity.PostAsJsonAsync(
            "/api/auth/change-password",
            new ChangePasswordRequest { NewPassword = password },
            Json)).EnsureSuccessStatusCode();

        var (devIdentity, _) = await AuthClientFactory.SignInAsync(
            environment.IdentityClient(),
            provisioned.Email,
            password);

        var work = roster.WorkClientFor(devIdentity);

        await work.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-09-01",
                DeveloperId = developer.Id,
                ProjectId = projectA.Id,
                TaskTitle = "In-range on A",
                HoursSpent = 4,
                Progress = 10,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        await work.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2025-01-01",
                DeveloperId = developer.Id,
                ProjectId = projectB.Id,
                TaskTitle = "Out of range on B",
                HoursSpent = 2,
                Progress = 10,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var filtered = await ApiEnvelopeReader.ReadDataAsync<TeamReportDto>(
            await roster.AdminReporting.GetAsync(
                $"/api/reports/team?from=2026-09-01&to=2026-09-30&projectId={projectA.Id}"));

        filtered.From.Should().Be("2026-09-01");
        filtered.To.Should().Be("2026-09-30");
        filtered.Developers.Should().Contain(row => row.DeveloperId == developer.Id);
        filtered.Developers.Single(row => row.DeveloperId == developer.Id).Entries.Should().Be(1);
        filtered.Projects.Should().Contain(row => row.ProjectId == projectA.Id);
        filtered.Projects.Should().NotContain(row => row.ProjectId == projectB.Id);
    }

    [Fact]
    public async Task Developer_report_is_available_to_the_assignee_and_respects_the_project_filter()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var developer = await roster.CreateDeveloperAsync(project.Id);

        var (provisioned, _, identity) = await roster.ProvisionDeveloperLoginAsync(developer);
        var password = $"NewPass{roster.UniqueTag}1";
        (await identity.PostAsJsonAsync(
            "/api/auth/change-password",
            new ChangePasswordRequest { NewPassword = password },
            Json)).EnsureSuccessStatusCode();

        var (devIdentity, _) = await AuthClientFactory.SignInAsync(
            environment.IdentityClient(),
            provisioned.Email,
            password);

        var work = roster.WorkClientFor(devIdentity);

        await work.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-10-05",
                DeveloperId = developer.Id,
                ProjectId = project.Id,
                TaskTitle = "Developer report entry",
                HoursSpent = 6,
                Progress = 15,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var report = await ApiEnvelopeReader.ReadDataAsync<DeveloperTotalsDto>(
            await roster.ReportingClientFor(devIdentity).GetAsync(
                $"/api/reports/developers/{developer.Id}?from=2026-10-01&to=2026-10-31&projectId={project.Id}"));

        report.DeveloperId.Should().Be(developer.Id);
        report.Entries.Should().Be(1);
        report.HoursLogged.Should().Be(6);
    }

    [Fact]
    public async Task A_report_range_longer_than_one_year_is_refused_with_a_readable_message()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);

        var response = await roster.AdminReporting.GetAsync("/api/reports/team?from=2024-01-01&to=2026-12-31");

        var envelope = await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.BadRequest);
        envelope.Message.Should().NotContain("SqlException");
        envelope.Message.Should().NotContain(" at ");
    }
}
