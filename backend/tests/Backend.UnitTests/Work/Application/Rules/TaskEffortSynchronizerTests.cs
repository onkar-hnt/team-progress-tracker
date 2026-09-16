using Backend.UnitTests.Fakes;

using Work.Application.Rules;
using Work.Domain;

namespace Backend.UnitTests.Work.Application.Rules;

public sealed class TaskEffortSynchronizerTests
{
    [Fact]
    public async Task RecomputeCountsDistinctWorkedDaysAcrossEntries()
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
        store.SeedEntry(MakeEntry(task, new DateOnly(2026, 3, 1), hours: 2));
        store.SeedEntry(MakeEntry(task, new DateOnly(2026, 3, 1), hours: 3));
        store.SeedEntry(MakeEntry(task, new DateOnly(2026, 3, 2), hours: null));

        await new TaskEffortSynchronizer(store).RecomputeAsync([task.Id], null, CancellationToken.None);

        task.WorkedDays.Should().Be(2);
    }

    [Fact]
    public async Task RecomputeUsesEightHourStandardDayWhenNoHoursReportedForADay()
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
        store.SeedEntry(MakeEntry(task, new DateOnly(2026, 3, 1), hours: null));

        await new TaskEffortSynchronizer(store).RecomputeAsync([task.Id], null, CancellationToken.None);

        task.ActualHours.Should().Be(DomainRules.StandardWorkingHours);
    }

    [Fact]
    public async Task RecomputeSumsReportedHoursWhenAnyEntryOnDayHasHours()
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
        store.SeedEntry(MakeEntry(task, new DateOnly(2026, 3, 1), hours: 2));
        store.SeedEntry(MakeEntry(task, new DateOnly(2026, 3, 1), hours: 1.5m));

        await new TaskEffortSynchronizer(store).RecomputeAsync([task.Id], null, CancellationToken.None);

        task.ActualHours.Should().Be(3.5m);
    }

    [Fact]
    public async Task RecomputeCopiesEstimatedHoursFromSourceEntryWhenLinked()
    {
        var store = new FakeWorkStore();
        var task = new WorkTask
        {
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = Guid.CreateVersion7(),
            Name = "Task",
            CreatedDate = new DateOnly(2026, 1, 1),
            EstimatedHours = 1,
        };
        store.SeedTask(task);
        var source = MakeEntry(task, new DateOnly(2026, 3, 1), hours: 2);
        source.EstimatedHours = 40;
        store.SeedEntry(source);

        await new TaskEffortSynchronizer(store).RecomputeAsync([task.Id], source, CancellationToken.None);

        task.EstimatedHours.Should().Be(40);
    }

    private static DailyUpdate MakeEntry(WorkTask task, DateOnly date, decimal? hours) =>
        new()
        {
            DeveloperId = task.DeveloperId,
            ProjectId = task.ProjectId,
            TaskId = task.Id,
            TaskTitle = task.Name,
            EntryDate = date,
            HoursSpent = hours,
        };
}
