using Contracts;

using Identity.Application;
using Identity.Domain;

namespace Backend.UnitTests.Identity.Application;

public sealed class IdentityValidatorsTests
{
    [Fact]
    public void SignInRequiresEmailAndPassword()
    {
        var result = new SignInRequestValidator().Validate(new SignInRequest());

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage == "Enter your email address.");
        result.Errors.Should().Contain(error => error.ErrorMessage == "Enter your password.");
    }

    [Fact]
    public void ChangePasswordMustMeetMinimumLength()
    {
        var result = new ChangePasswordRequestValidator().Validate(
            new ChangePasswordRequest { NewPassword = "short" });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error =>
            error.ErrorMessage == "Use at least " + PasswordPolicy.MinimumLength + " characters.");
    }

    [Fact]
    public void ResetPasswordRequiresKnownTableAndRow()
    {
        var result = new ResetUserPasswordRequestValidator().Validate(
            new ResetUserPasswordRequest
            {
                RowId = Guid.Empty,
                Table = "admins",
                Password = "ValidPass1",
            });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage == "Choose whose password to reset.");
        result.Errors.Should().Contain(error =>
            error.ErrorMessage == "A login belongs either to an employee or a mentor.");
    }
}
