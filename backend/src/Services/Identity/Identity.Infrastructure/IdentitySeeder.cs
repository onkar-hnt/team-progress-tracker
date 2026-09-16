using Identity.Application;
using Identity.Domain;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

using SharedKernel;

namespace Identity.Infrastructure;

/// <summary>
/// Creates the one account that cannot be provisioned from the roster, because
/// somebody has to sign in before there is a roster. Everything else about the
/// database is seeded by the Team and Work services.
/// </summary>
public sealed class IdentitySeeder(
    IdentityDbContext context,
    IPasswordHasher hasher,
    IConfiguration configuration,
    ILogger<IdentitySeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var email = configuration["Seed:AdminEmail"];
        var password = configuration["Seed:AdminPassword"];

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            logger.LogInformation(
                "No Seed:AdminEmail / Seed:AdminPassword configured, so no administrator was seeded.");
            return;
        }

        if (await context.Profiles.AnyAsync(profile => profile.Email == email, cancellationToken))
        {
            return;
        }

        context.Profiles.Add(new Profile
        {
            Email = email,
            DisplayName = configuration["Seed:AdminName"] ?? "Administrator",
            Role = DomainRules.RoleAdmin,
            Status = DomainRules.ProfileActive,

            // The seeded administrator is configuration, not a handed-out
            // password, so it is not forced through the change screen.
            MustChangePassword = false,
            PasswordHash = hasher.Hash(password),
        });

        await context.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Seeded the administrator login {Email}", email);
    }
}
