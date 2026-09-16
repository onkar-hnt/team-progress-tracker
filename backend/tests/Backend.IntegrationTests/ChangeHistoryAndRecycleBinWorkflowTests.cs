using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

using SharedKernel;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class ChangeHistoryAndRecycleBinWorkflowTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Updating_a_daily_update_records_before_and_after_values_in_the_change_log()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var developer = await roster.CreateDeveloperAsync(project.Id);

        var create = await roster.AdminWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-11-01",
                DeveloperId = developer.Id,
                ProjectId = project.Id,
                TaskTitle = "Change log task",
                WorkDone = "Initial work",
                Progress = 10,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var entry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(create);

        var body = JsonSerializer.Serialize(new { workDone = "Revised work" }, Json);
        (await roster.AdminWork.PutAsync(
            $"/api/daily-updates/{entry.Id}",
            new StringContent(body, Encoding.UTF8, "application/json"))).EnsureSuccessStatusCode();

        var history = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<ChangeRecordDto>>(
            await roster.AdminWork.GetAsync($"/api/change-log/daily_updates/{entry.Id}"));

        var updateRow = history.Should().ContainSingle(row => row.Action == "update").Subject;
        updateRow.Changes.Should().Contain(change =>
            change.Field.Equals("work_done", StringComparison.OrdinalIgnoreCase)
            && change.Before == "Initial work"
            && change.After == "Revised work");
    }

    [Fact]
    public async Task A_soft_deleted_task_appears_in_the_recycle_bin_restores_and_can_be_destroyed()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var developer = await roster.CreateDeveloperAsync(project.Id);

        var create = await roster.AdminWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-11-05",
                DeveloperId = developer.Id,
                ProjectId = project.Id,
                TaskTitle = "Recycle bin task",
                Progress = 0,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var entry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(create);
        var taskId = entry.TaskId!.Value;

        (await roster.AdminWork.DeleteAsync($"/api/daily-updates/{entry.Id}")).EnsureSuccessStatusCode();
        (await roster.AdminWork.DeleteAsync($"/api/tasks/{taskId}")).EnsureSuccessStatusCode();

        var bin = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<DeletedRecordDto>>(
            await roster.AdminWork.GetAsync("/api/recycle-bin"));

        bin.Should().Contain(row => row.Kind == "task" && row.Id == taskId);

        (await roster.AdminWork.PostEmptyAsync($"/api/recycle-bin/task/{taskId}/restore"))
            .EnsureSuccessStatusCode();

        var taskAfterRestore = await ApiEnvelopeReader.ReadDataAsync<AssignedTaskDto>(
            await roster.AdminWork.GetAsync($"/api/tasks/{taskId}"));
        taskAfterRestore.Name.Should().Be("Recycle bin task");

        (await roster.AdminWork.DeleteAsync($"/api/tasks/{taskId}")).EnsureSuccessStatusCode();

        (await roster.AdminWork.DeleteAsync($"/api/recycle-bin/task/{taskId}"))
            .EnsureSuccessStatusCode();

        var missing = await roster.AdminWork.GetAsync($"/api/tasks/{taskId}");
        missing.StatusCode.Should().Be(System.Net.HttpStatusCode.NotFound);
    }
}
