namespace SharedKernel;

/// <summary>
/// How the API gateway decides whether a bearer token still belongs to an
/// active login. Identity reads the same section so deactivation responses can
/// describe the delay honestly.
/// </summary>
public sealed class ProfileActiveGateOptions
{
    public const string Section = "ProfileActiveGate";

    /// <summary>
    /// After one read of <c>identity.Profiles.Status</c>, the gateway reuses
    /// that answer for this many seconds. A person deactivated mid-session may
    /// keep calling through the gateway until this window expires (worst case:
    /// the full value configured here).
    /// </summary>
    public int StatusCacheSeconds { get; set; } = 60;
}
