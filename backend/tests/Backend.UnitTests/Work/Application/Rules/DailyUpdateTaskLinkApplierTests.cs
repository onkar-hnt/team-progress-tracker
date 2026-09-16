using Backend.UnitTests.Fakes;

using Work.Application.Rules;
using Work.Domain;

namespace Backend.UnitTests.Work.Application.Rules;

public sealed class DailyUpdateTaskLinkApplierTests
{
    [Fact]
    public async Task FirstLinkAdoptsTaskStatusWhenRequestDidNotChangeStatus()
    {
        var store = new FakeWorkStore();
        var developerId = Guid.CreateVersion7();
        var task = new WorkTask
        {
            DeveloperId = developerId,
            ProjectId = Guid.CreateVersion7(),
            Name = "Task",
            Status = DomainRules.TaskCompleted,
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        store.SeedTask(task);

        var entry = new DailyUpdate
        {
            DeveloperId = developerId,
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            TaskTitle = "Task",
            EntryDate = new DateOnly(2026, 3, 1),
            Status = DomainRules.TaskInProgress,
            Progress = 40,
        };

        await new DailyUpdateTaskLinkApplier(store).ApplyAsync(
            entry,
            previousTaskId: null,
            previousStatus: entry.Status,
            statusChangedInRequest: false,
            CancellationToken.None);

        entry.Status.Should().Be(DomainRules.TaskCompleted);
        entry.Progress.Should().Be(100);
        entry.IsBlocked.Should().BeFalse();
    }

    [Fact]
    public async Task FirstLinkKeepsEntryStatusWhenRequestExplicitlyChangedStatus()
    {
        var store = new FakeWorkStore();
        var developerId = Guid.CreateVersion7();
        var task = new WorkTask
        {
            DeveloperId = developerId,
            ProjectId = Guid.CreateVersion7(),
            Name = "Task",
            Status = DomainRules.TaskCompleted,
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        store.SeedTask(task);

        var entry = new DailyUpdate
        {
            DeveloperId = developerId,
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            TaskTitle = "Task",
            EntryDate = new DateOnly(2026, 3, 1),
            Status = DomainRules.TaskInProgress,
            Progress = 40,
        };

        await new DailyUpdateTaskLinkApplier(store).ApplyAsync(
            entry,
            previousTaskId: null,
            previousStatus: DomainRules.TaskNotStarted,
            statusChangedInRequest: true,
            CancellationToken.None);

        entry.Status.Should().Be(DomainRules.TaskInProgress);
        entry.Progress.Should().Be(40);
    }

    [Fact]
    public async Task LinkRejectsTaskOwnedByAnotherDeveloper()
    {
        var store = new FakeWorkStore();
        var task = new WorkTask
        {
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = Guid.CreateVersion7(),
            Name = "Task",
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        store.SeedTask(task);

        var entry = new DailyUpdate
        {
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            TaskTitle = "Task",
            EntryDate = new DateOnly(2026, 3, 1),
        };

        var act = () => new DailyUpdateTaskLinkApplier(store).ApplyAsync(
            entry,
            null,
            entry.Status,
            false,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationFailedException>()
            .WithMessage("That task belongs to another developer.");
    }
}
