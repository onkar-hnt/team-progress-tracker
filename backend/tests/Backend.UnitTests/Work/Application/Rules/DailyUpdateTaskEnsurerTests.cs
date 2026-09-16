using Backend.UnitTests.Fakes;

using Work.Application.Rules;
using Work.Domain;

namespace Backend.UnitTests.Work.Application.Rules;

public sealed class DailyUpdateTaskEnsurerTests
{
    [Fact]
    public async Task EnsureTaskLinkedCreatesTaskFromDailyUpdateTitleWhenNoneExists()
    {
        var store = new FakeWorkStore();
        var team = new FakeTeamDirectory();
        var developerId = Guid.CreateVersion7();
        var projectId = Guid.CreateVersion7();
        var mentorId = Guid.CreateVersion7();
        team.SeedPrimaryMentor(developerId, mentorId);

        var entry = new DailyUpdate
        {
            DeveloperId = developerId,
            ProjectId = projectId,
            TaskTitle = "  Build API  ",
            EntryDate = new DateOnly(2026, 3, 1),
            Status = DomainRules.TaskInProgress,
            Priority = "high",
        };

        await new DailyUpdateTaskEnsurer(store, team).EnsureTaskLinkedAsync(entry, CancellationToken.None);

        entry.TaskId.Should().NotBeNull();
        store.Tasks.Should().ContainSingle();
        var task = store.Tasks[0];
        task.Name.Should().Be("Build API");
        task.MentorId.Should().Be(mentorId);
        task.DeveloperId.Should().Be(developerId);
    }

    [Fact]
    public async Task EnsureTaskLinkedReusesExistingTaskWithSameTitle()
    {
        var store = new FakeWorkStore();
        var team = new FakeTeamDirectory();
        var developerId = Guid.CreateVersion7();
        var projectId = Guid.CreateVersion7();
        var existing = new WorkTask
        {
            Name = "Build API",
            DeveloperId = developerId,
            ProjectId = projectId,
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        store.SeedTask(existing);

        var entry = new DailyUpdate
        {
            DeveloperId = developerId,
            ProjectId = projectId,
            TaskTitle = "Build API",
            EntryDate = new DateOnly(2026, 3, 1),
        };

        await new DailyUpdateTaskEnsurer(store, team).EnsureTaskLinkedAsync(entry, CancellationToken.None);

        entry.TaskId.Should().Be(existing.Id);
        store.Tasks.Should().ContainSingle();
    }

    [Fact]
    public async Task EnsureTaskLinkedSkipsWhenEntryAlreadyHasTask()
    {
        var store = new FakeWorkStore();
        var team = new FakeTeamDirectory();
        var taskId = Guid.CreateVersion7();
        var entry = new DailyUpdate
        {
            TaskId = taskId,
            TaskTitle = "Ignored",
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = Guid.CreateVersion7(),
            EntryDate = new DateOnly(2026, 3, 1),
        };

        await new DailyUpdateTaskEnsurer(store, team).EnsureTaskLinkedAsync(entry, CancellationToken.None);

        store.Tasks.Should().BeEmpty();
        entry.TaskId.Should().Be(taskId);
    }
}
