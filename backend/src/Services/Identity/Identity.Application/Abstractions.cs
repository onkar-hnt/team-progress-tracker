using Identity.Domain;

namespace Identity.Application;

public interface IProfileRepository
{
    Task<Profile?> FindByEmailAsync(string email, CancellationToken cancellationToken = default);

    Task<Profile?> FindByIdAsync(Guid profileId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Profile>> ListAsync(CancellationToken cancellationToken = default);

    void Add(Profile profile);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface IPasswordHasher
{
    string Hash(string password);

    bool Verify(string password, string hash);
}

public sealed record IssuedToken(string AccessToken, DateTimeOffset ExpiresAt);

public interface ITokenIssuer
{
    IssuedToken Issue(Profile profile, Guid? developerId, Guid? mentorId);
}
