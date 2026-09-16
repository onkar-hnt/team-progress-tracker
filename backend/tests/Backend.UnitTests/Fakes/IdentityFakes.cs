using Contracts;

using Identity.Application;
using Identity.Domain;

using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

using SharedKernel;

namespace Backend.UnitTests.Fakes;

internal sealed class FakeProfileRepository : IProfileRepository
{
    private readonly Dictionary<Guid, Profile> _byId = [];
    private readonly Dictionary<string, Profile> _byEmail = [];

    public void Seed(Profile profile)
    {
        _byId[profile.Id] = profile;
        _byEmail[profile.Email.ToLowerInvariant()] = profile;
    }

    public Task<Profile?> FindByEmailAsync(string email, CancellationToken cancellationToken) =>
        Task.FromResult(_byEmail.TryGetValue(email.ToLowerInvariant(), out var profile) ? profile : null);

    public Task<Profile?> FindByIdAsync(Guid profileId, CancellationToken cancellationToken) =>
        Task.FromResult(_byId.TryGetValue(profileId, out var profile) ? profile : null);

    public Task<IReadOnlyList<Profile>> ListAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<Profile>>([.. _byId.Values]);

    public void Add(Profile profile) => Seed(profile);

    public Task SaveChangesAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class PlainTextPasswordHasher : IPasswordHasher
{
    public string Hash(string password) => $"hash:{password}";

    public bool Verify(string password, string hash) => hash == Hash(password);
}

internal sealed class FakeTokenIssuer : ITokenIssuer
{
    public IssuedToken Issue(Profile profile, Guid? developerId, Guid? mentorId) =>
        new("token", new DateTimeOffset(2026, 6, 1, 12, 0, 0, TimeSpan.Zero));
}

internal sealed class FakeRosterGateway : IRosterGateway
{
    public Task<RosterLinks> FindLinksAsync(Guid profileId, CancellationToken cancellationToken) =>
        Task.FromResult(new RosterLinks(null, null));

    public Task<RosterMemberDto?> FindMemberAsync(
        string table,
        Guid rowId,
        CancellationToken cancellationToken) =>
        Task.FromResult<RosterMemberDto?>(null);

    public Task LinkProfileAsync(
        string table,
        Guid rowId,
        Guid profileId,
        CancellationToken cancellationToken) =>
        Task.CompletedTask;

    public Task<bool> MentorSeesDeveloperAsync(
        Guid mentorId,
        Guid developerId,
        CancellationToken cancellationToken) =>
        Task.FromResult(false);
}

internal static class AuthServiceFactory
{
    public static AuthService Create(
        FakeProfileRepository profiles,
        FakeCurrentUser currentUser,
        IPasswordHasher? hasher = null) =>
        new(
            profiles,
            hasher ?? new PlainTextPasswordHasher(),
            new FakeTokenIssuer(),
            new FakeRosterGateway(),
            currentUser,
            NullLogger<AuthService>.Instance);
}

internal static class AccountServiceFactory
{
    public static AccountService Create(
        FakeProfileRepository profiles,
        FakeCurrentUser currentUser) =>
        new(
            profiles,
            new PlainTextPasswordHasher(),
            new FakeRosterGateway(),
            currentUser,
            Options.Create(new ProfileActiveGateOptions { StatusCacheSeconds = 30 }),
            NullLogger<AccountService>.Instance);
}
