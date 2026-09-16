using SharedKernel;

namespace Identity.Domain;

/// <summary>
/// A login. Credentials and role live in one row, because sign-in always
/// needed the password hash and profile fields together.
/// </summary>
public sealed class Profile : Entity
{
    public required string Email { get; set; }
    public required string DisplayName { get; set; }

    /// <summary>
    /// Authoritative for what the app lets this person do. An employee row's
    /// access_role feeds this, but never the other way round.
    /// </summary>
    public string Role { get; set; } = DomainRules.RoleDeveloper;

    public string Status { get; set; } = DomainRules.ProfileActive;

    /// <summary>
    /// True until the person replaces the password they were handed. Sessions
    /// in this state are allowed to do exactly one thing: set a password.
    /// </summary>
    public bool MustChangePassword { get; set; } = true;

    public required string PasswordHash { get; set; }

    public bool IsActive => Status == DomainRules.ProfileActive;
    public bool IsAdmin => Role == DomainRules.RoleAdmin;

    public void Deactivate() => Status = DomainRules.ProfileInactive;

    public void Activate() => Status = DomainRules.ProfileActive;
}
