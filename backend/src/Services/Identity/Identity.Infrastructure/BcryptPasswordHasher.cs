using Identity.Application;

namespace Identity.Infrastructure;

/// <summary>
/// bcrypt, matching the algorithm used for passwords migrated from the earlier database.
/// Verifying tolerates a malformed or empty hash by failing rather than
/// throwing, so one bad row cannot turn a wrong password into a 500.
/// </summary>
public sealed class BcryptPasswordHasher : IPasswordHasher
{
    private const int WorkFactor = 12;

    public string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, WorkFactor);

    public bool Verify(string password, string hash)
    {
        if (string.IsNullOrWhiteSpace(hash) || string.IsNullOrEmpty(password))
        {
            return false;
        }

        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }
}
