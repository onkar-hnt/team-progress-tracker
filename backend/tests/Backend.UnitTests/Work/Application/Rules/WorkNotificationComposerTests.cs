using Backend.UnitTests.Fakes;

using Contracts;

using Work.Application.Rules;
using Work.Domain;

namespace Backend.UnitTests.Work.Application.Rules;

public sealed class WorkNotificationComposerTests
{
    [Fact]
    public async Task TaskCreatedNotifiesDeveloperWithTaskAssignedType()
    {
        var developerId = Guid.CreateVersion7();
        var profileId = Guid.CreateVersion7();
        var team = new FakeTeamDirectory();
        team.SeedDeveloper(developerId, "Dev", profileId);

        var task = new WorkTask
        {
            DeveloperId = developerId,
            ProjectId = Guid.CreateVersion7(),
            Name = "API work",
            CreatedDate = new DateOnly(2026, 3, 1),
        };

        var requests = await new WorkNotificationComposer(new FakeCurrentUser(), team)
            .ForTaskCreatedAsync(task, CancellationToken.None);

        requests.Should().ContainSingle();
        requests[0].Type.Should().Be(DomainRules.NotificationTaskAssigned);
        requests[0].RecipientProfileId.Should().Be(profileId);
        requests[0].EntityType.Should().Be("task");
    }

    [Fact]
    public async Task DeveloperCommentNotifiesMentorsWithTaskCommentTypeWhenLinkedToTask()
    {
        var developerId = Guid.CreateVersion7();
        var mentorProfile = Guid.CreateVersion7();
        var team = new FakeTeamDirectory();
        team.SeedMentorsForDeveloper(
            developerId,
            new MentorContact(Guid.CreateVersion7(), "Mentor", mentorProfile));

        var comment = new Feedback
        {
            DeveloperId = developerId,
            TaskId = Guid.CreateVersion7(),
            Comment = "Question",
            AuthorRole = DomainRules.RoleDeveloper,
            FeedbackDate = new DateOnly(2026, 3, 1),
        };

        var requests = await new WorkNotificationComposer(new FakeCurrentUser(), team)
            .ForCommentCreatedAsync(comment, CancellationToken.None);

        requests.Should().ContainSingle();
        requests[0].Type.Should().Be(DomainRules.NotificationTaskCommentAdded);
        requests[0].RecipientProfileId.Should().Be(mentorProfile);
    }

    [Fact]
    public async Task DailyUpdateSubmittedNotifiesMentorsWithDailyUpdateType()
    {
        var developerId = Guid.CreateVersion7();
        var mentorProfile = Guid.CreateVersion7();
        var team = new FakeTeamDirectory();
        team.SeedMentorsForDeveloper(
            developerId,
            new MentorContact(Guid.CreateVersion7(), "Mentor", mentorProfile));

        var entry = new DailyUpdate
        {
            DeveloperId = developerId,
            ProjectId = Guid.CreateVersion7(),
            TaskTitle = "Work",
            EntryDate = new DateOnly(2026, 3, 15),
            IsBlocked = false,
        };

        var requests = await new WorkNotificationComposer(new FakeCurrentUser(), team)
            .ForDailyUpdateCreatedAsync(entry, CancellationToken.None);

        requests.Should().ContainSingle();
        requests[0].Type.Should().Be(DomainRules.NotificationDailyUpdateSubmitted);
        requests[0].Message.Should().Be("Daily update for 2026-03-15.");
    }

    [Fact]
    public async Task WorkBlockedNotificationMentionsBlockedInMessage()
    {
        var developerId = Guid.CreateVersion7();
        var team = new FakeTeamDirectory();
        team.SeedMentorsForDeveloper(
            developerId,
            new MentorContact(Guid.CreateVersion7(), "Mentor", Guid.CreateVersion7()));

        var entry = new DailyUpdate
        {
            DeveloperId = developerId,
            ProjectId = Guid.CreateVersion7(),
            TaskTitle = "Work",
            EntryDate = new DateOnly(2026, 3, 15),
            IsBlocked = true,
        };

        var requests = await new WorkNotificationComposer(new FakeCurrentUser(), team)
            .ForWorkBlockedAsync(entry, CancellationToken.None);

        requests[0].Type.Should().Be(DomainRules.NotificationWorkBlocked);
        requests[0].Message.Should().Contain("blocked");
    }

    [Fact]
    public async Task TaskStatusChangedMessageUsesSentenceCaseStatuses()
    {
        var developerId = Guid.CreateVersion7();
        var profileId = Guid.CreateVersion7();
        var team = new FakeTeamDirectory();
        team.SeedDeveloper(developerId, "Dev", profileId);

        var task = new WorkTask
        {
            DeveloperId = developerId,
            ProjectId = Guid.CreateVersion7(),
            Name = "API work",
            CreatedDate = new DateOnly(2026, 3, 1),
        };

        var requests = await new WorkNotificationComposer(new FakeCurrentUser(), team)
            .ForTaskStatusChangedAsync(
                task,
                DomainRules.TaskNotStarted,
                DomainRules.TaskInProgress,
                CancellationToken.None);

        requests[0].Message.Should().Be("API work: Not started to In progress.");
    }
}
