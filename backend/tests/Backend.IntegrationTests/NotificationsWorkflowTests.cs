using System.Net.Http.Json;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

using SharedKernel;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class NotificationsWorkflowTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_mentor_comment_notifies_the_developer_and_not_the_mentor_who_wrote_it()
    {
        var scenario = await NotificationScenario.CreateAsync(environment);

        await scenario.MentorWork.PostAsJsonAsync(
            "/api/feedback",
            new SaveCommentRequest
            {
                DeveloperId = scenario.Developer.Id,
                MentorId = scenario.Mentor.Id,
                TaskId = scenario.TaskId,
                ProjectId = scenario.Project.Id,
                Comment = "Notification trigger comment.",
            },
            Json);

        // A notification points at the task rather than repeating what was
        // said, so the task is what identifies it.
        var developerInbox = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<NotificationDto>>(
            await scenario.DeveloperNotifications.GetAsync("/api/notifications"));

        developerInbox.Should().Contain(note =>
            note.Type == DomainRules.NotificationTaskCommentAdded && note.EntityId == scenario.TaskId);

        var mentorInbox = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<NotificationDto>>(
            await scenario.MentorNotifications.GetAsync("/api/notifications"));

        mentorInbox.Should().NotContain(note =>
            note.Type == DomainRules.NotificationTaskCommentAdded && note.EntityId == scenario.TaskId);
    }

    [Fact]
    public async Task Listing_unread_count_and_marking_notifications_read_updates_the_inbox()
    {
        var scenario = await NotificationScenario.CreateAsync(environment);

        await scenario.MentorWork.PostAsJsonAsync(
            "/api/feedback",
            new SaveCommentRequest
            {
                DeveloperId = scenario.Developer.Id,
                MentorId = scenario.Mentor.Id,
                TaskId = scenario.TaskId,
                ProjectId = scenario.Project.Id,
                Comment = "Unread workflow comment.",
            },
            Json);

        var unread = await ApiEnvelopeReader.ReadDataAsync<int>(
            await scenario.DeveloperNotifications.GetAsync("/api/notifications/unread-count"));
        unread.Should().BeGreaterThan(0);

        var inbox = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<NotificationDto>>(
            await scenario.DeveloperNotifications.GetAsync("/api/notifications"));

        var target = inbox.First(note =>
            note.Type == DomainRules.NotificationTaskCommentAdded && note.EntityId == scenario.TaskId);

        (await scenario.DeveloperNotifications.PostEmptyAsync($"/api/notifications/{target.Id}/read"))
            .EnsureSuccessStatusCode();

        var unreadAfterOne = await ApiEnvelopeReader.ReadDataAsync<int>(
            await scenario.DeveloperNotifications.GetAsync("/api/notifications/unread-count"));
        unreadAfterOne.Should().Be(unread - 1);

        (await scenario.DeveloperNotifications.PostEmptyAsync("/api/notifications/read-all"))
            .EnsureSuccessStatusCode();

        var unreadAfterAll = await ApiEnvelopeReader.ReadDataAsync<int>(
            await scenario.DeveloperNotifications.GetAsync("/api/notifications/unread-count"));
        unreadAfterAll.Should().Be(0);
    }

    [Fact]
    public async Task A_muted_notification_type_is_not_delivered_to_the_inbox()
    {
        var scenario = await NotificationScenario.CreateAsync(environment);

        await scenario.DeveloperNotifications.PutAsJsonAsync(
            "/api/notification-preferences",
            new NotificationPreferencesDto
            {
                MutedNotificationTypes = [DomainRules.NotificationTaskCommentAdded],
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
                Comment = "Muted type comment.",
            },
            Json);

        var inbox = await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<NotificationDto>>(
            await scenario.DeveloperNotifications.GetAsync("/api/notifications"));

        inbox.Should().NotContain(note =>
            note.Type == DomainRules.NotificationTaskCommentAdded && note.EntityId == scenario.TaskId);
    }

    private sealed class NotificationScenario
    {
        public required DeveloperDto Developer { get; init; }

        public required MentorDto Mentor { get; init; }

        public required ProjectDto Project { get; init; }

        public required Guid TaskId { get; init; }

        public required HttpClient DeveloperNotifications { get; init; }

        public required HttpClient MentorNotifications { get; init; }

        public required HttpClient MentorWork { get; init; }

        public static async Task<NotificationScenario> CreateAsync(IntegrationTestEnvironment environment)
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
                    Date = "2026-08-01",
                    DeveloperId = developer.Id,
                    ProjectId = project.Id,
                    TaskTitle = "Notification task",
                    Progress = 0,
                    Status = DomainRules.TaskInProgress,
                },
                Json);

            var entry = await ApiEnvelopeReader.ReadDataAsync<DailyWorkEntryDto>(create);

            return new NotificationScenario
            {
                Developer = developer,
                Mentor = mentor,
                Project = project,
                TaskId = entry.TaskId!.Value,
                DeveloperNotifications = roster.NotificationsClientFor(devClient),
                MentorNotifications = roster.NotificationsClientFor(mentorClient),
                MentorWork = roster.WorkClientFor(mentorClient),
            };
        }
    }
}
