using FluentValidation;

namespace Work.Application;

internal static class ValidationDates
{
    public static bool IsOptionalDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        try
        {
            DateStrings.ParseDate(value, "date");
            return true;
        }
        catch (ValidationFailedException)
        {
            return false;
        }
    }

    public static bool IsRequiredDate(string value)
    {
        try
        {
            DateStrings.ParseDate(value, "date");
            return true;
        }
        catch (ValidationFailedException)
        {
            return false;
        }
    }
}

public sealed class SaveTaskRequestValidator : AbstractValidator<SaveTaskRequest>
{
    public SaveTaskRequestValidator()
    {
        RuleFor(request => request.Name)
            .Must(name => !string.IsNullOrWhiteSpace(name))
            .WithMessage("Enter a task name.");

        RuleFor(request => request.Name).MaximumLength(200);
        RuleFor(request => request.Code).MaximumLength(20).When(request => request.Code is not null);
        RuleFor(request => request.ProjectId).NotEmpty();
        RuleFor(request => request.DeveloperId).NotEmpty();
        RuleFor(request => request.Priority).Must(priority => DomainRules.TaskPriorities.Contains(priority));
        RuleFor(request => request.Status).Must(status => DomainRules.TaskStatuses.Contains(status));
        RuleFor(request => request.CreatedDate)
            .Must(ValidationDates.IsOptionalDate)
            .When(request => !string.IsNullOrWhiteSpace(request.CreatedDate));
        RuleFor(request => request.DueDate)
            .Must(ValidationDates.IsOptionalDate)
            .When(request => !string.IsNullOrWhiteSpace(request.DueDate));
        RuleFor(request => request.EstimatedHours)
            .GreaterThanOrEqualTo(0)
            .When(request => request.EstimatedHours is not null);
        RuleFor(request => request.EstimatedHours)
            .LessThanOrEqualTo(9999)
            .When(request => request.EstimatedHours is not null);
    }
}

public sealed class SaveDailyWorkEntryRequestValidator : AbstractValidator<SaveDailyWorkEntryRequest>
{
    public SaveDailyWorkEntryRequestValidator()
    {
        RuleFor(request => request.Date).Must(ValidationDates.IsRequiredDate);
        RuleFor(request => request.DeveloperId).NotEmpty();
        RuleFor(request => request.ProjectId).NotEmpty();
        RuleFor(request => request.TaskTitle)
            .Must(title => !string.IsNullOrWhiteSpace(title))
            .WithMessage("Enter a task title.");
        RuleFor(request => request.TaskTitle).MaximumLength(300);
        RuleFor(request => request.Status).Must(status => DomainRules.TaskStatuses.Contains(status));
        RuleFor(request => request.Priority).Must(priority => DomainRules.TaskPriorities.Contains(priority));
        RuleFor(request => request.Progress).InclusiveBetween(0, 100);
        RuleFor(request => request.HoursSpent)
            .GreaterThanOrEqualTo(0)
            .LessThanOrEqualTo(24)
            .When(request => request.HoursSpent is not null);
        RuleFor(request => request.EstimatedHours)
            .GreaterThanOrEqualTo(0)
            .LessThanOrEqualTo(9999)
            .When(request => request.EstimatedHours is not null);
    }
}

public sealed class SaveCommentRequestValidator : AbstractValidator<SaveCommentRequest>
{
    public SaveCommentRequestValidator()
    {
        RuleFor(request => request.DeveloperId).NotEmpty();
        RuleFor(request => request.Comment)
            .Must(comment => !string.IsNullOrWhiteSpace(comment))
            .WithMessage("Enter a comment.");
        RuleFor(request => request.Date)
            .Must(ValidationDates.IsOptionalDate)
            .When(request => !string.IsNullOrWhiteSpace(request.Date));
    }
}

public sealed class SetTaskStatusRequestValidator : AbstractValidator<SetTaskStatusRequest>
{
    public SetTaskStatusRequestValidator()
    {
        RuleFor(request => request.Status)
            .Must(status => !string.IsNullOrWhiteSpace(status) && DomainRules.TaskStatuses.Contains(status));
    }
}

public sealed class TaskUpdatePayloadValidator : AbstractValidator<UpdatePayload<SaveTaskRequest>>
{
    public TaskUpdatePayloadValidator()
    {
        When(payload => payload.Fields.Has("name"), () =>
        {
            RuleFor(payload => payload.Request.Name)
                .Must(name => !string.IsNullOrWhiteSpace(name))
                .WithMessage("Enter a task name.");
        });

        RuleFor(payload => payload.Request.Name).MaximumLength(200)
            .When(payload => payload.Fields.Has("name"));

        RuleFor(payload => payload.Request.ProjectId).NotEmpty()
            .When(payload => payload.Fields.Has("projectId"));

        RuleFor(payload => payload.Request.DeveloperId).NotEmpty()
            .When(payload => payload.Fields.Has("developerId"));

        RuleFor(payload => payload.Request.Priority)
            .Must(priority => DomainRules.TaskPriorities.Contains(priority))
            .When(payload => payload.Fields.Has("priority"));

        RuleFor(payload => payload.Request.Status)
            .Must(status => DomainRules.TaskStatuses.Contains(status))
            .When(payload => payload.Fields.Has("status"));

        RuleFor(payload => payload.Request.CreatedDate)
            .Must(ValidationDates.IsOptionalDate)
            .When(payload => payload.Fields.Has("createdDate") && !string.IsNullOrWhiteSpace(payload.Request.CreatedDate));

        RuleFor(payload => payload.Request.DueDate)
            .Must(ValidationDates.IsOptionalDate)
            .When(payload => payload.Fields.Has("dueDate") && !string.IsNullOrWhiteSpace(payload.Request.DueDate));

        RuleFor(payload => payload.Request.EstimatedHours)
            .GreaterThanOrEqualTo(0)
            .When(payload => payload.Fields.Has("estimatedHours") && payload.Request.EstimatedHours is not null);

        RuleFor(payload => payload.Request.EstimatedHours)
            .LessThanOrEqualTo(9999)
            .When(payload => payload.Fields.Has("estimatedHours") && payload.Request.EstimatedHours is not null);
    }
}

public sealed class DailyWorkEntryUpdatePayloadValidator : AbstractValidator<UpdatePayload<SaveDailyWorkEntryRequest>>
{
    public DailyWorkEntryUpdatePayloadValidator()
    {
        RuleFor(payload => payload.Request.Date)
            .Must(ValidationDates.IsRequiredDate)
            .When(payload => payload.Fields.Has("date"));

        RuleFor(payload => payload.Request.DeveloperId).NotEmpty()
            .When(payload => payload.Fields.Has("developerId"));

        RuleFor(payload => payload.Request.ProjectId).NotEmpty()
            .When(payload => payload.Fields.Has("projectId"));

        When(payload => payload.Fields.Has("taskTitle"), () =>
        {
            RuleFor(payload => payload.Request.TaskTitle)
                .Must(title => !string.IsNullOrWhiteSpace(title))
                .WithMessage("Enter a task title.");
        });

        RuleFor(payload => payload.Request.TaskTitle).MaximumLength(300)
            .When(payload => payload.Fields.Has("taskTitle"));

        RuleFor(payload => payload.Request.Status)
            .Must(status => DomainRules.TaskStatuses.Contains(status))
            .When(payload => payload.Fields.Has("status"));

        RuleFor(payload => payload.Request.Priority)
            .Must(priority => DomainRules.TaskPriorities.Contains(priority))
            .When(payload => payload.Fields.Has("priority"));

        RuleFor(payload => payload.Request.Progress).InclusiveBetween(0, 100)
            .When(payload => payload.Fields.Has("progress"));

        RuleFor(payload => payload.Request.HoursSpent)
            .GreaterThanOrEqualTo(0)
            .LessThanOrEqualTo(24)
            .When(payload => payload.Fields.Has("hoursSpent") && payload.Request.HoursSpent is not null);

        RuleFor(payload => payload.Request.EstimatedHours)
            .GreaterThanOrEqualTo(0)
            .LessThanOrEqualTo(9999)
            .When(payload => payload.Fields.Has("estimatedHours") && payload.Request.EstimatedHours is not null);
    }
}

public sealed class CommentUpdatePayloadValidator : AbstractValidator<UpdatePayload<SaveCommentRequest>>
{
    public CommentUpdatePayloadValidator()
    {
        RuleFor(payload => payload.Request.DeveloperId).NotEmpty()
            .When(payload => payload.Fields.Has("developerId"));

        When(payload => payload.Fields.Has("comment"), () =>
        {
            RuleFor(payload => payload.Request.Comment)
                .Must(comment => !string.IsNullOrWhiteSpace(comment))
                .WithMessage("Enter a comment.");
        });

        RuleFor(payload => payload.Request.Date)
            .Must(ValidationDates.IsOptionalDate)
            .When(payload => payload.Fields.Has("date") && !string.IsNullOrWhiteSpace(payload.Request.Date));
    }
}
