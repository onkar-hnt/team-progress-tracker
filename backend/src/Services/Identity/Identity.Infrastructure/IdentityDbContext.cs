using Identity.Domain;

using Microsoft.EntityFrameworkCore;

using SharedKernel;

namespace Identity.Infrastructure;

public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Db.Identity);

        modelBuilder.Entity<Profile>(profile =>
        {
            profile.ToTable(Db.Profiles);
            profile.HasKey(row => row.Id);

            profile.Property(row => row.Email).HasMaxLength(320).IsRequired();
            profile.Property(row => row.DisplayName).HasMaxLength(200).IsRequired();
            profile.Property(row => row.Role).HasMaxLength(20).IsRequired();
            profile.Property(row => row.Status).HasMaxLength(20).IsRequired();
            profile.Property(row => row.PasswordHash).HasMaxLength(200).IsRequired();
            profile.Property(row => row.MustChangePassword).IsRequired();

            // SQL Server compares strings case-insensitively under the default
            // collation, so this single index does what Postgres needed
            // lower(email) for.
            profile.HasIndex(row => row.Email).IsUnique();
            profile.HasIndex(row => row.Role);

            profile.ToTable(table =>
            {
                table.HasCheckConstraint(
                    "CK_Profiles_Role",
                    "[Role] IN ('admin', 'mentor', 'developer')");

                table.HasCheckConstraint(
                    "CK_Profiles_Status",
                    "[Status] IN ('active', 'inactive')");
            });
        });
    }
}
