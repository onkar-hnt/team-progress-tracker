using System.Net.Http.Json;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

using SharedKernel;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class WorkWorkflowTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_daily_update_with_only_a_task_title_creates_the_task_and_links_it()
    {
        var scenario = await WorkScenario.CreateAsync(environment);
        const string title = "Integration task from daily update";

        var response = await scenario.DeveloperWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-02-10",
                DeveloperId = scenario.Developer.Id,
                ProjectId = scenario.Project.Id,
                TaskTitle = title,
                Priority = "high",
                EstimatedHours = 12,
                Progress = 10,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var entry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(response);
        entry.TaskId.Should().NotBeNull();

        var taskResponse = await scenario.DeveloperWork.GetAsync($"/api/tasks/{entry.TaskId}");
        var task = await ApiEnvelopeReader.ReadDataAsync<AssignedTaskDto>(taskResponse);

        task.Name.Should().Be(title);
        task.Priority.Should().Be("high");
        task.EstimatedHours.Should().Be(12);
    }

    [Fact]
    public async Task Task_worked_days_and_actual_hours_recompute_from_reported_and_default_eight_hour_days()
    {
        var scenario = await WorkScenario.CreateAsync(environment);
        const string title = "Effort totals task";

        await scenario.DeveloperWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-03-01",
                DeveloperId = scenario.Developer.Id,
                ProjectId = scenario.Project.Id,
                TaskTitle = title,
                HoursSpent = 5,
                Progress = 20,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        await scenario.DeveloperWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-03-02",
                DeveloperId = scenario.Developer.Id,
                ProjectId = scenario.Project.Id,
                TaskTitle = title,
                Progress = 30,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var tasks = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<AssignedTaskDto>>(
            await scenario.DeveloperWork.GetAsync(
                $"/api/tasks?developerIds={scenario.Developer.Id}&projectIds={scenario.Project.Id}"));

        var task = tasks.Single(row => row.Name == title);
        task.WorkedDays.Should().Be(2);
        task.ActualHours.Should().Be(13);
    }

    [Fact]
    public async Task Completing_a_daily_update_completes_the_linked_task()
    {
        var scenario = await WorkScenario.CreateAsync(environment);

        var create = await scenario.DeveloperWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-04-01",
                DeveloperId = scenario.Developer.Id,
                ProjectId = scenario.Project.Id,
                TaskTitle = "Complete via entry",
                Progress = 80,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var entry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(create);

        var update = await scenario.DeveloperWork.PutAsJsonAsync(
            $"/api/daily-updates/{entry.Id}",
            new
            {
                status = DomainRules.TaskCompleted,
                progress = 100,
            },
            Json);

        var saved = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(update);
        saved.Status.Should().Be(DomainRules.TaskCompleted);

        var task = await ApiEnvelopeReader.ReadDataAsync<AssignedTaskDto>(
            await scenario.DeveloperWork.GetAsync($"/api/tasks/{entry.TaskId}"));

        task.Status.Should().Be(DomainRules.TaskCompleted);
    }

    [Fact]
    public async Task Blocking_a_task_blocks_its_open_daily_update_and_unblocking_syncs_back()
    {
        var scenario = await WorkScenario.CreateAsync(environment);

        var create = await scenario.DeveloperWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-05-01",
                DeveloperId = scenario.Developer.Id,
                ProjectId = scenario.Project.Id,
                TaskTitle = "Block sync task",
                Progress = 40,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var entry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(create);

        var blockTask = await scenario.DeveloperWork.PatchAsJsonAsync(
            $"/api/tasks/{entry.TaskId}/status",
            new SetTaskStatusRequest { Status = DomainRules.TaskBlocked },
            Json);

        var blockedTask = await ApiEnvelopeReader.ReadDataAsync<AssignedTaskDto>(blockTask);
        blockedTask.Status.Should().Be(DomainRules.TaskBlocked);

        var entryAfterBlock = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(
            await scenario.DeveloperWork.GetAsync($"/api/daily-updates/{entry.Id}"));

        entryAfterBlock.Status.Should().Be(DomainRules.TaskBlocked);
        entryAfterBlock.IsBlocked.Should().BeTrue();

        var unblockTask = await scenario.DeveloperWork.PatchAsJsonAsync(
            $"/api/tasks/{entry.TaskId}/status",
            new SetTaskStatusRequest { Status = DomainRules.TaskInProgress },
            Json);

        var unblockedTask = await ApiEnvelopeReader.ReadDataAsync<AssignedTaskDto>(unblockTask);
        unblockedTask.Status.Should().Be(DomainRules.TaskInProgress);

        var entryAfterUnblock = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(
            await scenario.DeveloperWork.GetAsync($"/api/daily-updates/{entry.Id}"));

        entryAfterUnblock.Status.Should().Be(DomainRules.TaskInProgress);
        entryAfterUnblock.IsBlocked.Should().BeFalse();
    }

    [Fact]
    public async Task The_assignee_can_change_task_status_with_a_status_only_patch()
    {
        var scenario = await WorkScenario.CreateAsync(environment);

        var create = await scenario.DeveloperWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-06-01",
                DeveloperId = scenario.Developer.Id,
                ProjectId = scenario.Project.Id,
                TaskTitle = "Patch status task",
                Progress = 10,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var entry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(create);

        var patch = await scenario.DeveloperWork.PatchAsJsonAsync(
            $"/api/tasks/{entry.TaskId}/status",
            new SetTaskStatusRequest { Status = DomainRules.TaskCompleted },
            Json);

        var task = await ApiEnvelopeReader.ReadDataAsync<AssignedTaskDto>(patch);
        task.Status.Should().Be(DomainRules.TaskCompleted);
    }

    private sealed class WorkScenario
    {
        public required TestRosterBuilder Roster { get; init; }

        public required ProjectDto Project { get; init; }

        public required DeveloperDto Developer { get; init; }

        public required HttpClient DeveloperWork { get; init; }

        public static async Task<WorkScenario> CreateAsync(IntegrationTestEnvironment environment)
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

            return new WorkScenario
            {
                Roster = roster,
                Project = project,
                Developer = developer,
                DeveloperWork = roster.WorkClientFor(devIdentity),
            };
        }
    }
}

internal static class HttpClientPatchExtensions
{
    public static Task<HttpResponseMessage> PatchAsJsonAsync<T>(
        this HttpClient client,
        string requestUri,
        T value,
        JsonSerializerOptions options) =>
        client.PatchAsync(
            requestUri,
            JsonContent.Create(value, options: options));
}
