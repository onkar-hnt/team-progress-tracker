using FluentValidation;

namespace Team.Application;

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
}

public sealed class SaveDeveloperRequestValidator : AbstractValidator<SaveDeveloperRequest>
{
    public SaveDeveloperRequestValidator()
    {
        RuleFor(request => request.Name)
            .Must(name => !string.IsNullOrWhiteSpace(name))
            .WithMessage("Enter the employee's name.");

        RuleFor(request => request.Name).MaximumLength(200);

        RuleFor(request => request.Email)
            .EmailAddress().WithMessage("That does not look like an email address.")
            .When(request => !string.IsNullOrWhiteSpace(request.Email));

        RuleFor(request => request.Email).MaximumLength(320)
            .When(request => request.Email is not null);

        RuleFor(request => request.EmployeeId).MaximumLength(50)
            .When(request => request.EmployeeId is not null);

        RuleFor(request => request.Role).MaximumLength(100)
            .When(request => request.Role is not null);

        RuleFor(request => request.Location).MaximumLength(100)
            .When(request => request.Location is not null);

        RuleFor(request => request.AccessRole)
            .Must(role => role is null || DomainRules.Roles.Contains(role))
            .WithMessage("Access level must be admin, mentor or developer.");

        RuleFor(request => request.CreatedDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("Created date must be a date like 2026-09-16.")
            .When(request => !string.IsNullOrWhiteSpace(request.CreatedDate));
    }
}

public sealed class DeveloperUpdatePayloadValidator : AbstractValidator<UpdatePayload<SaveDeveloperRequest>>
{
    public DeveloperUpdatePayloadValidator()
    {
        When(payload => payload.Fields.Has("name"), () =>
        {
            RuleFor(payload => payload.Request.Name)
                .Must(name => !string.IsNullOrWhiteSpace(name))
                .WithMessage("Enter the employee's name.");
        });

        RuleFor(payload => payload.Request.Name).MaximumLength(200)
            .When(payload => payload.Fields.Has("name"));

        RuleFor(payload => payload.Request.Email)
            .EmailAddress().WithMessage("That does not look like an email address.")
            .When(payload => payload.Fields.Has("email") && !string.IsNullOrWhiteSpace(payload.Request.Email));

        RuleFor(payload => payload.Request.AccessRole)
            .Must(role => role is null || DomainRules.Roles.Contains(role))
            .WithMessage("Access level must be admin, mentor or developer.")
            .When(payload => payload.Fields.Has("accessRole"));

        RuleFor(payload => payload.Request.CreatedDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("Created date must be a date like 2026-09-16.")
            .When(payload => payload.Fields.Has("createdDate"));
    }
}

public sealed class SaveMentorRequestValidator : AbstractValidator<SaveMentorRequest>
{
    public SaveMentorRequestValidator()
    {
        RuleFor(request => request.Name)
            .Must(name => !string.IsNullOrWhiteSpace(name))
            .WithMessage("Enter the mentor's name.");

        RuleFor(request => request.Name).MaximumLength(200);

        RuleFor(request => request.Email)
            .NotEmpty().WithMessage("Enter the mentor's email address.")
            .EmailAddress().WithMessage("That does not look like an email address.")
            .MaximumLength(320);

        RuleFor(request => request.CreatedDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("Created date must be a date like 2026-09-16.")
            .When(request => !string.IsNullOrWhiteSpace(request.CreatedDate));
    }
}

public sealed class MentorUpdatePayloadValidator : AbstractValidator<UpdatePayload<SaveMentorRequest>>
{
    public MentorUpdatePayloadValidator()
    {
        When(payload => payload.Fields.Has("name"), () =>
        {
            RuleFor(payload => payload.Request.Name)
                .Must(name => !string.IsNullOrWhiteSpace(name))
                .WithMessage("Enter the mentor's name.");
        });

        RuleFor(payload => payload.Request.Email)
            .NotEmpty().WithMessage("Enter the mentor's email address.")
            .EmailAddress().WithMessage("That does not look like an email address.")
            .When(payload => payload.Fields.Has("email"));

        RuleFor(payload => payload.Request.CreatedDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("Created date must be a date like 2026-09-16.")
            .When(payload => payload.Fields.Has("createdDate"));
    }
}

public sealed class SaveProjectRequestValidator : AbstractValidator<SaveProjectRequest>
{
    public SaveProjectRequestValidator()
    {
        RuleFor(request => request.Name)
            .Must(name => !string.IsNullOrWhiteSpace(name))
            .WithMessage("Enter the project name.");

        RuleFor(request => request.Name).MaximumLength(200);
        RuleFor(request => request.Client).MaximumLength(200).When(request => request.Client is not null);
        RuleFor(request => request.Description).MaximumLength(2000)
            .When(request => request.Description is not null);

        RuleFor(request => request.Status)
            .Must(status => DomainRules.ProjectStatuses.Contains(status))
            .WithMessage("Status must be planned, active, on-hold or completed.");

        RuleFor(request => request.StartDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("Start date must be a date like 2026-09-16.")
            .When(request => !string.IsNullOrWhiteSpace(request.StartDate));

        RuleFor(request => request.EndDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("End date must be a date like 2026-09-16.")
            .When(request => !string.IsNullOrWhiteSpace(request.EndDate));

        RuleFor(request => request)
            .Must(request => DatesOrdered(request.StartDate, request.EndDate))
            .WithMessage("End date cannot be before the start date.");
    }

    private static bool DatesOrdered(string? start, string? end)
    {
        if (string.IsNullOrWhiteSpace(start) || string.IsNullOrWhiteSpace(end))
        {
            return true;
        }

        var startDate = DateStrings.ParseDate(start, "Start date");
        var endDate = DateStrings.ParseDate(end, "End date");

        return endDate >= startDate;
    }
}

public sealed class ProjectUpdatePayloadValidator : AbstractValidator<UpdatePayload<SaveProjectRequest>>
{
    public ProjectUpdatePayloadValidator()
    {
        When(payload => payload.Fields.Has("name"), () =>
        {
            RuleFor(payload => payload.Request.Name)
                .Must(name => !string.IsNullOrWhiteSpace(name))
                .WithMessage("Enter the project name.");
        });

        RuleFor(payload => payload.Request.Status)
            .Must(status => DomainRules.ProjectStatuses.Contains(status))
            .WithMessage("Status must be planned, active, on-hold or completed.")
            .When(payload => payload.Fields.Has("status"));

        RuleFor(payload => payload.Request.StartDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("Start date must be a date like 2026-09-16.")
            .When(payload => payload.Fields.Has("startDate"));

        RuleFor(payload => payload.Request.EndDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("End date must be a date like 2026-09-16.")
            .When(payload => payload.Fields.Has("endDate"));

        RuleFor(payload => payload)
            .Must(payload => ProjectDatesOrdered(payload))
            .WithMessage("End date cannot be before the start date.");
    }

    private static bool ProjectDatesOrdered(UpdatePayload<SaveProjectRequest> payload)
    {
        var start = payload.Fields.Has("startDate")
            ? payload.Request.StartDate
            : null;

        var end = payload.Fields.Has("endDate")
            ? payload.Request.EndDate
            : null;

        if (string.IsNullOrWhiteSpace(start) || string.IsNullOrWhiteSpace(end))
        {
            return true;
        }

        return DateStrings.ParseDate(end, "End date") >= DateStrings.ParseDate(start, "Start date");
    }
}

public sealed class SetMentorAssignmentsRequestValidator : AbstractValidator<SetMentorAssignmentsRequest>
{
    public SetMentorAssignmentsRequestValidator()
    {
        RuleFor(request => request.DeveloperIds)
            .Must(ids => ids.Distinct().Count() == ids.Count)
            .WithMessage("Each employee can only appear once in the assignment list.");

        RuleFor(request => request.AssignedDate)
            .Must(ValidationDates.IsOptionalDate)
            .WithMessage("Assigned date must be a date like 2026-09-16.")
            .When(request => !string.IsNullOrWhiteSpace(request.AssignedDate));
    }
}
