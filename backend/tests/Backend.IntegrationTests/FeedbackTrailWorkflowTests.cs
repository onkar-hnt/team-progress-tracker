using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

using SharedKernel;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class FeedbackTrailWorkflowTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_task_conversation_returns_every_comment_in_order_with_author_roles()
    {
        var scenario = await FeedbackScenario.CreateAsync(environment);

        _ = await ApiEnvelopeReader.ReadDataAsync<MentorCommentDto>(
            await scenario.MentorWork.PostAsJsonAsync(
                "/api/feedback",
                new SaveCommentRequest
                {
                    DeveloperId = scenario.Developer.Id,
                    MentorId = scenario.Mentor.Id,
                    TaskId = scenario.TaskId,
                    ProjectId = scenario.Project.Id,
                    Date = "2026-07-01",
                    Comment = "Please clarify the acceptance criteria.",
                },
                Json));

        await scenario.DeveloperWork.PostAsJsonAsync(
            "/api/feedback",
            new SaveCommentRequest
            {
                DeveloperId = scenario.Developer.Id,
                TaskId = scenario.TaskId,
                ProjectId = scenario.Project.Id,
                Date = "2026-07-02",
                Comment = "Criteria are documented in the ticket.",
            },
            Json);

        await scenario.MentorWork.PostAsJsonAsync(
            "/api/feedback",
            new SaveCommentRequest
            {
                DeveloperId = scenario.Developer.Id,
                MentorId = scenario.Mentor.Id,
                TaskId = scenario.TaskId,
                ProjectId = scenario.Project.Id,
                Date = "2026-07-03",
                Comment = "Thanks — proceed to implementation.",
            },
            Json);

        var response = await scenario.DeveloperWork.GetAsync($"/api/feedback?taskIds={scenario.TaskId}");
        var listed = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<MentorCommentDto>>(response);

        // Feedback is listed newest first, like every other work listing. A
        // conversation reads the other way round, so the client sorts by
        // creation time before rendering and this asserts that same order.
        var trail = listed.OrderBy(row => row.CreatedAt, StringComparer.Ordinal).ToList();

        trail.Should().HaveCount(3);
        trail.Select(row => row.Comment).Should().ContainInOrder(
            "Please clarify the acceptance criteria.",
            "Criteria are documented in the ticket.",
            "Thanks — proceed to implementation.");
        trail[0].AuthorRole.Should().Be(DomainRules.RoleMentor);
        trail[1].AuthorRole.Should().Be(DomainRules.RoleDeveloper);
        trail[2].AuthorRole.Should().Be(DomainRules.RoleMentor);
    }

    [Fact]
    public async Task A_mentor_cannot_comment_on_a_developer_they_are_not_assigned_to()
    {
        var scenario = await FeedbackScenario.CreateAsync(environment);
        var outsider = await scenario.Roster.CreateDeveloperAsync(scenario.Project.Id);

        var entry = await scenario.Roster.AdminWork.PostAsJsonAsync(
            "/api/daily-updates",
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-07-10",
                DeveloperId = outsider.Id,
                ProjectId = scenario.Project.Id,
                TaskTitle = "Outsider task",
                Progress = 0,
                Status = DomainRules.TaskInProgress,
            },
            Json);

        var outsiderEntry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(entry);

        var response = await scenario.MentorWork.PostAsJsonAsync(
            "/api/feedback",
            new SaveCommentRequest
            {
                DeveloperId = outsider.Id,
                MentorId = scenario.Mentor.Id,
                TaskId = outsiderEntry.TaskId,
                ProjectId = scenario.Project.Id,
                Comment = "Should not be allowed.",
            },
            Json);

        await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.Forbidden);
    }

    private sealed class FeedbackScenario
    {
        public required TestRosterBuilder Roster { get; init; }

        public required ProjectDto Project { get; init; }

        public required DeveloperDto Developer { get; init; }

        public required MentorDto Mentor { get; init; }

        public required Guid TaskId { get; init; }

        public required HttpClient DeveloperWork { get; init; }

        public required HttpClient MentorWork { get; init; }

        public static async Task<FeedbackScenario> CreateAsync(IntegrationTestEnvironment environment)
        {
            var roster = await TestRosterBuilder.CreateAdminAsync(environment);
            var project = await roster.CreateProjectAsync();
            var developer = await roster.CreateDeveloperAsync(project.Id);
            var mentor = await roster.CreateMentorAsync();
            await roster.AssignMentorAsync(mentor.Id, developer.Id);

            var (devProvisioned, _, devIdentity) = await roster.ProvisionDeveloperLoginAsync(developer);
            var (mentorProvisioned, _, mentorIdentity) = await roster.ProvisionMentorLoginAsync(mentor);

            var password = $"NewPass{roster.UniqueTag}1";
            await devIdentity.PostAsJsonAsync(
                "/api/auth/change-password",
                new ChangePasswordRequest { NewPassword = password },
                Json);
            await mentorIdentity.PostAsJsonAsync(
                "/api/auth/change-password",
                new ChangePasswordRequest { NewPassword = password },
                Json);

            var (devClient, _) = await AuthClientFactory.SignInAsync(
                environment.IdentityClient(),
                devProvisioned.Email,
                password);
            var (mentorClient, _) = await AuthClientFactory.SignInAsync(
                environment.IdentityClient(),
                mentorProvisioned.Email,
                password);

            var developerWork = roster.WorkClientFor(devClient);
            var create = await developerWork.PostAsJsonAsync(
                "/api/daily-updates",
                new SaveDailyWorkEntryRequest
                {
                    Date = "2026-07-01",
                    DeveloperId = developer.Id,
                    ProjectId = project.Id,
                    TaskTitle = "Feedback trail task",
                    Progress = 5,
                    Status = DomainRules.TaskInProgress,
                },
                Json);

            var entry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(create);

            return new FeedbackScenario
            {
                Roster = roster,
                Project = project,
                Developer = developer,
                Mentor = mentor,
                TaskId = entry.TaskId!.Value,
                DeveloperWork = developerWork,
                MentorWork = roster.WorkClientFor(mentorClient),
            };
        }
    }
}
