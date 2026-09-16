using Identity.Domain;

namespace Backend.UnitTests.Identity.Domain;

public sealed class PasswordPolicyTests
{
    [Fact]
    public void BlankPasswordReportsEnterAPassword()
    {
        PasswordPolicy.Problems(null).Should().ContainSingle("Enter a password.");
    }

    [Fact]
    public void PasswordShorterThanEightCharactersIsRejected()
    {
        var problems = PasswordPolicy.Problems("Ab1");

        problems.Should().Contain($"Use at least {PasswordPolicy.MinimumLength} characters.");
    }

    [Fact]
    public void PasswordWithoutALetterIsRejected()
    {
        PasswordPolicy.Problems("12345678").Should().Contain("Include at least one letter.");
    }

    [Fact]
    public void PasswordWithoutANumberIsRejected()
    {
        PasswordPolicy.Problems("abcdefgh").Should().Contain("Include at least one number.");
    }

    [Fact]
    public void ValidPasswordHasNoProblems()
    {
        PasswordPolicy.Problems("Secret1!").Should().BeEmpty();
    }

    [Fact]
    public void RequireThrowsValidationFailedExceptionWithSummaryMessage()
    {
        var act = () => PasswordPolicy.Require("short");

        act.Should().Throw<ValidationFailedException>()
            .Which.Message.Should().Be("That password cannot be used.");
    }

    [Theory]
    [InlineData("Alice Smith", "Alice@123")]
    [InlineData("Bob", "Bob@123")]
    [InlineData("Jo 2", "Jo2@123")]
    [InlineData("A!", "Employee@123")]
    [InlineData("  Priya  Kumar  ", "Priya@123")]
    public void TemporaryPasswordFollowsInitialPasswordForRules(string name, string expected)
    {
        PasswordPolicy.TemporaryFor(name).Should().Be(expected);
    }
}
