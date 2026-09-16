using Contracts;

using FluentValidation;

using Work.Application;

namespace Backend.UnitTests.Work.Application;

public sealed class WorkValidatorsTests
{
    private static SaveDailyWorkEntryRequest ValidDaily() => new()
    {
        Date = "2026-03-01",
        DeveloperId = Guid.CreateVersion7(),
        ProjectId = Guid.CreateVersion7(),
        TaskTitle = "Build feature",
        Status = DomainRules.TaskInProgress,
        Priority = "medium",
        Progress = 50,
    };

    [Fact]
    public void BlankTaskTitleIsRejected()
    {
        var request = ValidDaily() with { TaskTitle = "  " };
        var result = new SaveDailyWorkEntryRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage == "Enter a task title.");
    }

    [Fact]
    public void UnknownTaskStatusIsRejected()
    {
        var request = ValidDaily() with { Status = "paused" };
        var result = new SaveDailyWorkEntryRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void UnknownPriorityIsRejected()
    {
        var request = ValidDaily() with { Priority = "urgent" };
        var result = new SaveDailyWorkEntryRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void ProgressOutsideZeroToOneHundredIsRejected()
    {
        var request = ValidDaily() with { Progress = 101 };
        var result = new SaveDailyWorkEntryRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void BadDateStringIsRejected()
    {
        var request = ValidDaily() with { Date = "01-03-2026" };
        var result = new SaveDailyWorkEntryRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
    }

    [Fact]
    public void PartialUpdateDoesNotValidateFieldsTheCallerDidNotSend()
    {
        var payload = new UpdatePayload<SaveDailyWorkEntryRequest>(
            ValidDaily() with { Progress = 999, TaskTitle = "  " },
            JsonFieldSet.From(System.Text.Json.JsonDocument.Parse("{}").RootElement));

        var result = new DailyWorkEntryUpdatePayloadValidator().Validate(payload);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void BlankTaskNameOnCreateIsRejected()
    {
        var request = new SaveTaskRequest
        {
            Name = " ",
            ProjectId = Guid.CreateVersion7(),
            DeveloperId = Guid.CreateVersion7(),
            Priority = "medium",
            Status = DomainRules.TaskNotStarted,
        };

        var result = new SaveTaskRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage == "Enter a task name.");
    }
}
