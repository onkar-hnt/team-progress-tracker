using System.Text.Json;

using Backend.UnitTests.Fakes;

using Contracts;

using Work.Domain;

namespace Backend.UnitTests.Work.Application;

public sealed class WorkMappingPartialUpdateTests
{
    [Fact]
    public void AbsentKeyLeavesStoredTaskDescriptionUntouched()
    {
        var task = new WorkTask
        {
            Name = "Task",
            Description = "Keep me",
            ProjectId = Guid.CreateVersion7(),
            DeveloperId = Guid.CreateVersion7(),
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        var fields = JsonFieldSet.From(Parse("{}"));

        WorkMappingInvoker.ApplyTaskRequest(
            new SaveTaskRequest
            {
                Name = "Task",
                Description = "Replace",
                ProjectId = task.ProjectId,
                DeveloperId = task.DeveloperId,
                Priority = "medium",
                Status = DomainRules.TaskNotStarted,
            },
            fields,
            task);

        task.Description.Should().Be("Keep me");
    }

    [Fact]
    public void ExplicitNullClearsTaskDescription()
    {
        var task = new WorkTask
        {
            Name = "Task",
            Description = "Old",
            ProjectId = Guid.CreateVersion7(),
            DeveloperId = Guid.CreateVersion7(),
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        var fields = JsonFieldSet.From(Parse("""{"description":null}"""));

        WorkMappingInvoker.ApplyTaskRequest(
            new SaveTaskRequest
            {
                Name = "Task",
                Description = null,
                ProjectId = task.ProjectId,
                DeveloperId = task.DeveloperId,
                Priority = "medium",
                Status = DomainRules.TaskNotStarted,
            },
            fields,
            task);

        task.Description.Should().BeNull();
    }

    [Fact]
    public void BlankTaskNameIsNotAppliedOnPartialUpdate()
    {
        var task = new WorkTask
        {
            Name = "Original",
            ProjectId = Guid.CreateVersion7(),
            DeveloperId = Guid.CreateVersion7(),
            CreatedDate = new DateOnly(2026, 1, 1),
        };
        var fields = JsonFieldSet.From(Parse("""{"name":"  "}"""));

        WorkMappingInvoker.ApplyTaskRequest(
            new SaveTaskRequest
            {
                Name = "  ",
                ProjectId = task.ProjectId,
                DeveloperId = task.DeveloperId,
                Priority = "medium",
                Status = DomainRules.TaskNotStarted,
            },
            fields,
            task);

        task.Name.Should().Be("Original");
    }

    [Fact]
    public void ExplicitNullClearsDailyUpdateOptionalTextField()
    {
        var entry = new DailyUpdate
        {
            TaskTitle = "Title",
            DeveloperId = Guid.CreateVersion7(),
            ProjectId = Guid.CreateVersion7(),
            EntryDate = new DateOnly(2026, 3, 1),
            Remarks = "Notes",
        };
        var fields = JsonFieldSet.From(Parse("""{"remarks":null}"""));

        WorkMappingInvoker.ApplyDailyRequest(
            new SaveDailyWorkEntryRequest
            {
                Date = "2026-03-01",
                DeveloperId = entry.DeveloperId,
                ProjectId = entry.ProjectId,
                TaskTitle = "Title",
                Status = DomainRules.TaskInProgress,
                Priority = "medium",
                Remarks = null,
            },
            fields,
            entry);

        entry.Remarks.Should().BeNull();
    }

    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement;
}
