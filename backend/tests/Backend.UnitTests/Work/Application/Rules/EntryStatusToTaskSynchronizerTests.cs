using Backend.UnitTests.Fakes;

using Work.Application;
using Work.Application.Rules;
using Work.Domain;

namespace Backend.UnitTests.Work.Application.Rules;

public sealed class EntryStatusToTaskSynchronizerTests
{
    [Fact]
    public async Task EntryStatusChangeUpdatesLinkedTask()
    {
        var store = new FakeWorkStore();
        var sync = new WorkSyncContext();
        var task = new WorkTask
        {
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = Guid.CreateVersion7(),
            Name = "Task",
            Status = DomainRules.TaskNotStarted,
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
        };

        await new EntryStatusToTaskSynchronizer(store, sync).SyncAsync(entry, CancellationToken.None);

        task.Status.Should().Be(DomainRules.TaskInProgress);
    }

    [Fact]
    public async Task EntryToTaskSyncIsSkippedWhileTaskToEntriesCascadeRuns()
    {
        var store = new FakeWorkStore();
        var sync = new WorkSyncContext { SuppressEntryToTaskStatusSync = true };
        var task = new WorkTask
        {
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = Guid.CreateVersion7(),
            Name = "Task",
            Status = DomainRules.TaskNotStarted,
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
            Status = DomainRules.TaskCompleted,
        };

        await new EntryStatusToTaskSynchronizer(store, sync).SyncAsync(entry, CancellationToken.None);

        task.Status.Should().Be(DomainRules.TaskNotStarted);
    }
}
