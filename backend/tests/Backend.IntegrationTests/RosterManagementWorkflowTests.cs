using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class RosterManagementWorkflowTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Creating_an_employee_assigns_a_DEV_business_code_server_side()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var developer = await roster.CreateDeveloperAsync();

        developer.Code.Should().NotBeNullOrWhiteSpace();
        developer.Code.Should().StartWith("DEV");
    }

    [Fact]
    public async Task Updating_a_project_name_persists_the_new_value()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var renamed = $"Renamed project {roster.UniqueTag}";

        var response = await roster.AdminTeam.PutAsJsonAsync(
            $"/api/projects/{project.Id}",
            new SaveProjectRequest
            {
                Name = renamed,
                Client = project.Client,
                Status = project.Status,
                Active = project.Active,
            },
            Json);

        var updated = await ApiEnvelopeReader.ReadDataAsync<ProjectDto>(response);
        updated.Name.Should().Be(renamed);
    }

    [Fact]
    public async Task Partially_updating_an_employee_leaves_fields_that_were_not_sent_unchanged()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var developer = await roster.CreateDeveloperAsync();

        var body = JsonSerializer.Serialize(new { name = $"Renamed {roster.UniqueTag}" }, Json);
        var response = await roster.AdminTeam.PutAsync(
            $"/api/developers/{developer.Id}",
            new StringContent(body, Encoding.UTF8, "application/json"));

        var updated = await ApiEnvelopeReader.ReadDataAsync<DeveloperDto>(response);

        updated.Name.Should().Be($"Renamed {roster.UniqueTag}");
        updated.Location.Should().Be("Manchester");
    }

    [Fact]
    public async Task Soft_deleting_a_mentor_project_and_employee_moves_them_out_of_the_live_lists()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var mentor = await roster.CreateMentorAsync();
        var developer = await roster.CreateDeveloperAsync(project.Id);

        (await roster.AdminTeam.DeleteAsync($"/api/developers/{developer.Id}")).EnsureSuccessStatusCode();
        (await roster.AdminTeam.DeleteAsync($"/api/mentors/{mentor.Id}")).EnsureSuccessStatusCode();
        (await roster.AdminTeam.DeleteAsync($"/api/projects/{project.Id}")).EnsureSuccessStatusCode();

        var developers = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<DeveloperDto>>(
            await roster.AdminTeam.GetAsync("/api/developers"));
        var mentors = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<MentorDto>>(
            await roster.AdminTeam.GetAsync("/api/mentors"));
        var projects = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<ProjectDto>>(
            await roster.AdminTeam.GetAsync("/api/projects"));

        developers.Should().NotContain(row => row.Id == developer.Id);
        mentors.Should().NotContain(row => row.Id == mentor.Id);
        projects.Should().NotContain(row => row.Id == project.Id);
    }

    [Fact]
    public async Task Creating_a_mentor_and_project_assigns_MEN_and_PRJ_codes()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var mentor = await roster.CreateMentorAsync();
        var project = await roster.CreateProjectAsync();

        mentor.Code.Should().StartWith("MEN");
        project.Code.Should().StartWith("PRJ");
    }

    [Fact]
    public async Task Replacing_a_mentors_developer_assignments_updates_the_set_transactionally()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var mentor = await roster.CreateMentorAsync();
        var first = await roster.CreateDeveloperAsync();
        var second = await roster.CreateDeveloperAsync();

        await roster.AssignMentorAsync(mentor.Id, first.Id, second.Id);

        var listAfterAdd = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<MentorAssignmentDto>>(
            await roster.AdminTeam.GetAsync("/api/mentor-assignments"));

        listAfterAdd.Where(row => row.MentorId == mentor.Id)
            .Select(row => row.DeveloperId)
            .Should()
            .BeEquivalentTo([first.Id, second.Id]);

        await roster.AssignMentorAsync(mentor.Id, second.Id);

        var listAfterReplace = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<MentorAssignmentDto>>(
            await roster.AdminTeam.GetAsync("/api/mentor-assignments"));

        listAfterReplace.Where(row => row.MentorId == mentor.Id)
            .Select(row => row.DeveloperId)
            .Should()
            .BeEquivalentTo([second.Id]);
    }
}
