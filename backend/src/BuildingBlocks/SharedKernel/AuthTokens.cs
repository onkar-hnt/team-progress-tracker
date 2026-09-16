namespace SharedKernel;

public sealed class JwtOptions
{
    public const string Section = "Jwt";

    public string Issuer { get; set; } = "team-progress-tracker";
    public string Audience { get; set; } = "team-progress-tracker-app";

    /// <summary>
    /// Supplied by configuration or the Jwt__SigningKey environment variable.
    /// Development has one in appsettings.Development.json; without a value a
    /// host refuses to start rather than signing with something guessable.
    /// </summary>
    public string SigningKey { get; set; } = string.Empty;

    public int LifetimeMinutes { get; set; } = 480;
}

/// <summary>
/// Claims the token carries beyond the standard ones. The roster links ride
/// along so no request needs a lookup to know who is asking; they are read at
/// sign-in, so a link changed afterwards applies from the next sign-in.
/// </summary>
public static class AppClaims
{
    public const string ProfileId = "profile_id";
    public const string DeveloperId = "developer_id";
    public const string MentorId = "mentor_id";
    public const string MustChangePassword = "must_change_password";
}
