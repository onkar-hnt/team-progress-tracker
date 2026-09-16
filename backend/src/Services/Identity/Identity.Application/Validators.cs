using Contracts;

using FluentValidation;

using Identity.Domain;

namespace Identity.Application;

public sealed class SignInRequestValidator : AbstractValidator<SignInRequest>
{
    public SignInRequestValidator()
    {
        RuleFor(request => request.Email)
            .NotEmpty().WithMessage("Enter your email address.")
            .EmailAddress().WithMessage("That does not look like an email address.")
            .MaximumLength(320);

        RuleFor(request => request.Password)
            .NotEmpty().WithMessage("Enter your password.");
    }
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(request => request.NewPassword)
            .MinimumLength(PasswordPolicy.MinimumLength)
            .WithMessage($"Use at least {PasswordPolicy.MinimumLength} characters.")
            .MaximumLength(128);
    }
}

public sealed class SetAccountStateRequestValidator : AbstractValidator<SetAccountStateRequest>
{
    public SetAccountStateRequestValidator()
    {
        RuleFor(request => request.ProfileId).NotEmpty().WithMessage("Choose a login.");

        RuleFor(request => request.State)
            .Must(state => state is "active" or "inactive")
            .WithMessage("A login is either active or inactive.");
    }
}

public sealed class ProvisionLoginRequestValidator : AbstractValidator<ProvisionLoginRequest>
{
    public ProvisionLoginRequestValidator()
    {
        RuleFor(request => request.RowId).NotEmpty().WithMessage("Choose who the login is for.");

        RuleFor(request => request.Table)
            .Must(table => table is "developers" or "mentors")
            .WithMessage("A login belongs either to an employee or a mentor.");

        RuleFor(request => request.Email)
            .EmailAddress().WithMessage("That does not look like an email address.")
            .When(request => !string.IsNullOrWhiteSpace(request.Email));
    }
}

public sealed class ResetUserPasswordRequestValidator : AbstractValidator<ResetUserPasswordRequest>
{
    public ResetUserPasswordRequestValidator()
    {
        RuleFor(request => request.RowId).NotEmpty().WithMessage("Choose whose password to reset.");

        RuleFor(request => request.Table)
            .Must(table => table is "developers" or "mentors")
            .WithMessage("A login belongs either to an employee or a mentor.");

        RuleFor(request => request.Password)
            .MinimumLength(PasswordPolicy.MinimumLength)
            .WithMessage($"Use at least {PasswordPolicy.MinimumLength} characters.")
            .MaximumLength(128);
    }
}
