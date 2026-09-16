namespace Contracts;

public sealed record SignInRequest
{
    public string Email { get; init; } = string.Empty;
    public string Password { get; init; } = string.Empty;
}

/// <summary>
/// What the browser stores after signing in. The user half matches the
/// frontend's AppUser, so the existing auth provider keeps working.
/// </summary>
public sealed record SignInResponse
{
    public required string AccessToken { get; init; }
    public required string ExpiresAt { get; init; }
    public required AuthenticatedUserDto User { get; init; }
}

public sealed record AuthenticatedUserDto
{
    public required string Email { get; init; }
    public required string Name { get; init; }
    public required string Role { get; init; }
    public Guid? DeveloperId { get; init; }
    public Guid? MentorId { get; init; }

    /// <summary>
    /// True while the account still has the password it was created with. The
    /// app routes these sessions to Set password and nowhere else.
    /// </summary>
    public bool MustChangePassword { get; init; }
}

public sealed record ChangePasswordRequest
{
    public string? CurrentPassword { get; init; }
    public string NewPassword { get; init; } = string.Empty;
}

/// <summary>An account as the Logins screen lists it.</summary>
public sealed record AccountDto
{
    public required Guid Id { get; init; }
    public required string Email { get; init; }
    public required string DisplayName { get; init; }
    public required string Role { get; init; }
    public required string Status { get; init; }
    public required bool MustChangePassword { get; init; }
    public required string CreatedAt { get; init; }
}

public sealed record SetAccountStateRequest
{
    public Guid ProfileId { get; init; }
    public string State { get; init; } = "active";
}

/// <summary>
/// What happened when an administrator activated or deactivated a login.
/// </summary>
public sealed record SetAccountStateResponse
{
    public required Guid ProfileId { get; init; }

    /// <summary>Display name on the profile that was checked.</summary>
    public required string Name { get; init; }

    /// <summary>Either active or inactive, matching the profile status values in the database.</summary>
    public required string State { get; init; }

    /// <summary>
    /// True when the profile was already in the requested state and nothing was
    /// written to the database.
    /// </summary>
    public bool Unchanged { get; init; }

    /// <summary>
    /// Whether existing bearer tokens stop reaching other services through the
    /// gateway while this login is inactive.
    /// </summary>
    public bool SessionsRevoked { get; init; }

    /// <summary>
    /// When a login was just deactivated, explains that the gateway may honour
    /// the previous status for up to <c>ProfileActiveGate:StatusCacheSeconds</c>.
    /// </summary>
    public string? Warning { get; init; }
}

/// <summary>Confirms whose password was reset and that they must replace it.</summary>
public sealed record ResetUserPasswordResponse
{
    public required Guid ProfileId { get; init; }
    public required string Name { get; init; }
    public required string Email { get; init; }

    /// <summary>Always true after an administrator or mentor resets a password.</summary>
    public bool MustChangePassword { get; init; }
}

/// <summary>Creates a login for somebody already on the roster.</summary>
public sealed record ProvisionLoginRequest
{
    public Guid RowId { get; init; }

    /// <summary>"developers" or "mentors", matching the frontend's wording.</summary>
    public string Table { get; init; } = "developers";

    public string? Email { get; init; }
}

public sealed record ProvisionLoginResponse
{
    public required Guid ProfileId { get; init; }
    public required string Email { get; init; }

    /// <summary>The password to hand over. Derived, never stored in clear.</summary>
    public required string TemporaryPassword { get; init; }

    public required bool Created { get; init; }
}

public sealed record ResetUserPasswordRequest
{
    public string Table { get; init; } = "developers";
    public Guid RowId { get; init; }
    public string Password { get; init; } = string.Empty;
}

/// <summary>
/// Identity's view of a roster row, so it can provision a login without
/// reaching into the Team service's tables.
/// </summary>
public sealed record RosterMemberDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Email { get; init; }
    public Guid? ProfileId { get; init; }
    public string? AccessRole { get; init; }
    public bool IsAlsoMentor { get; init; }
}
