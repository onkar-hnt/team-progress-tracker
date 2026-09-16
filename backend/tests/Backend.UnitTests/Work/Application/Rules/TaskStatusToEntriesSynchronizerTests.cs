using Backend.UnitTests.Fakes;

using Work.Application;
using Work.Application.Rules;
using Work.Domain;

namespace Backend.UnitTests.Work.Application.Rules;

public sealed class TaskStatusToEntriesSynchronizerTests
{
    [Fact]
    public async Task TaskStatusChangeUpdatesAllLinkedActiveEntries()
    {
        var store = new FakeWorkStore();
        var sync = new WorkSyncContext();
        var task = new WorkTask
        {
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = Guid.CreateVersion7(),
            Name = "Task",
            Status = DomainRules.TaskBlocked,
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        store.SeedTask(task);

        var entry = new DailyUpdate
        {
            DeveloperId = task.DeveloperId,
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            TaskTitle = "Task",
            EntryDate = new DateOnly(2026, 3, 1),
            Status = DomainRules.TaskInProgress,
            Progress = 50,
        };
        store.SeedEntry(entry);

        await new TaskStatusToEntriesSynchronizer(store, sync).SyncAsync(
            task,
            DomainRules.TaskInProgress,
            CancellationToken.None);

        entry.Status.Should().Be(DomainRules.TaskBlocked);
        entry.IsBlocked.Should().BeTrue();
        sync.SuppressEntryToTaskStatusSync.Should().BeFalse();
        sync.SuppressWorkBlockedNotification.Should().BeFalse();
    }

    [Fact]
    public async Task TaskToEntriesSyncResetsSuppressFlagsEvenWhenSyncStartedWithThemSet()
    {
        var store = new FakeWorkStore();
        var sync = new WorkSyncContext
        {
            SuppressEntryToTaskStatusSync = true,
            SuppressWorkBlockedNotification = true,
        };
        var task = new WorkTask
        {
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = Guid.CreateVersion7(),
            Name = "Task",
            Status = DomainRules.TaskCompleted,
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        store.SeedTask(task);

        store.SeedEntry(new DailyUpdate
        {
            DeveloperId = task.DeveloperId,
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            TaskTitle = "Task",
            EntryDate = new DateOnly(2026, 3, 1),
            Status = DomainRules.TaskInProgress,
        });

        await new TaskStatusToEntriesSynchronizer(store, sync).SyncAsync(
            task,
            DomainRules.TaskInProgress,
            CancellationToken.None);

        sync.SuppressEntryToTaskStatusSync.Should().BeFalse();
        sync.SuppressWorkBlockedNotification.Should().BeFalse();
    }
}
