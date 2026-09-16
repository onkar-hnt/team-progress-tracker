using Identity.Application;
using Identity.Domain;

using Microsoft.EntityFrameworkCore;

namespace Identity.Infrastructure;

public sealed class ProfileRepository(IdentityDbContext context) : IProfileRepository
{
    public Task<Profile?> FindByEmailAsync(string email, CancellationToken cancellationToken = default) =>
        context.Profiles.FirstOrDefaultAsync(profile => profile.Email == email, cancellationToken);

    public Task<Profile?> FindByIdAsync(Guid profileId, CancellationToken cancellationToken = default) =>
        context.Profiles.FirstOrDefaultAsync(profile => profile.Id == profileId, cancellationToken);

    public async Task<IReadOnlyList<Profile>> ListAsync(CancellationToken cancellationToken = default) =>
        await context.Profiles.AsNoTracking().ToListAsync(cancellationToken);

    public void Add(Profile profile) => context.Profiles.Add(profile);

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        context.SaveChangesAsync(cancellationToken);
}
