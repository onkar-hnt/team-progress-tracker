using Contracts;

using Identity.Domain;

using Microsoft.Extensions.Logging;

using SharedKernel;

namespace Identity.Application;

public sealed class AuthService(
    IProfileRepository profiles,
    IPasswordHasher hasher,
    ITokenIssuer tokens,
    IRosterGateway roster,
    ICurrentUser currentUser,
    ILogger<AuthService> logger)
{
    public async Task<SignInResponse> SignInAsync(
        SignInRequest request,
        CancellationToken cancellationToken = default)
    {
        var email = (request.Email ?? string.Empty).Trim();
        var profile = await profiles.FindByEmailAsync(email, cancellationToken);

        // One message for an unknown address and a wrong password, so this
        // cannot be used to find out who has an account.
        if (profile is null || !hasher.Verify(request.Password ?? string.Empty, profile.PasswordHash))
        {
            logger.LogInformation("Rejected sign-in for {Email}", email);
            throw new UnauthenticatedException("That email and password do not match.");
        }

        if (!profile.IsActive)
        {
            throw new ForbiddenException(
                "This login has been deactivated. Ask an administrator to turn it back on.");
        }

        var links = profile.MustChangePassword
            ? new RosterLinks(null, null)
            : await roster.FindLinksAsync(profile.Id, cancellationToken);

        var issued = tokens.Issue(profile, links.DeveloperId, links.MentorId);

        logger.LogInformation("Signed in {ProfileId} as {Role}", profile.Id, profile.Role);

        return new SignInResponse
        {
            AccessToken = issued.AccessToken,
            ExpiresAt = DateStrings.From(issued.ExpiresAt),
            User = Describe(profile, links),
        };
    }

    /// <summary>
    /// Re-reads the signed-in person from the database, which is what the app
    /// calls after a password change or when restoring a session.
    /// </summary>
    public async Task<AuthenticatedUserDto> GetCurrentAsync(CancellationToken cancellationToken = default)
    {
        var profile = await profiles.FindByIdAsync(currentUser.ProfileId, cancellationToken)
            ?? throw new UnauthenticatedException();

        if (!profile.IsActive)
        {
            throw new ForbiddenException("This login has been deactivated.");
        }

        var links = profile.MustChangePassword
            ? new RosterLinks(null, null)
            : await roster.FindLinksAsync(profile.Id, cancellationToken);

        return Describe(profile, links);
    }

    /// <summary>
    /// Sets a new password. A session that still has the password it was given
    /// may do this without repeating it — that session exists only to get here
    /// — and everybody else must confirm the current one.
    /// </summary>
    public async Task<SignInResponse> ChangePasswordAsync(
        ChangePasswordRequest request,
        CancellationToken cancellationToken = default)
    {
        var profile = await profiles.FindByIdAsync(currentUser.ProfileId, cancellationToken)
            ?? throw new UnauthenticatedException();

        if (!profile.MustChangePassword)
        {
            if (string.IsNullOrEmpty(request.CurrentPassword)
                || !hasher.Verify(request.CurrentPassword, profile.PasswordHash))
            {
                throw new ValidationFailedException(
                    "That is not your current password.",
                    ["Check your current password and try again."]);
            }
        }

        PasswordPolicy.Require(request.NewPassword);

        // The database refused to clear the flag while the handed-out password
        // still worked, and so does this: otherwise 'change your password'
        // could be satisfied by keeping it.
        if (request.NewPassword == PasswordPolicy.TemporaryFor(profile.DisplayName))
        {
            throw new ValidationFailedException(
                "Choose a password of your own.",
                ["That is the password you were given. Pick a different one."]);
        }

        profile.PasswordHash = hasher.Hash(request.NewPassword);
        profile.MustChangePassword = false;

        await profiles.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Password changed for {ProfileId}", profile.Id);

        var links = await roster.FindLinksAsync(profile.Id, cancellationToken);
        var issued = tokens.Issue(profile, links.DeveloperId, links.MentorId);

        return new SignInResponse
        {
            AccessToken = issued.AccessToken,
            ExpiresAt = DateStrings.From(issued.ExpiresAt),
            User = Describe(profile, links),
        };
    }

    private static AuthenticatedUserDto Describe(Profile profile, RosterLinks links) => new()
    {
        Email = profile.Email,
        Name = profile.DisplayName,
        Role = profile.Role,
        DeveloperId = links.DeveloperId,
        MentorId = links.MentorId,
        MustChangePassword = profile.MustChangePassword,
    };
}
