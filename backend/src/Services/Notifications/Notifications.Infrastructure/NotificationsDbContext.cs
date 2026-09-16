using Notifications.Domain;

using Microsoft.EntityFrameworkCore;

using SharedKernel;

namespace Notifications.Infrastructure;

public sealed class NotificationsDbContext(DbContextOptions<NotificationsDbContext> options) : DbContext(options)
{
    public DbSet<Notification> Notifications => Set<Notification>();

    public DbSet<UserPreferences> UserPreferences => Set<UserPreferences>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Db.Notify);

        var typeCheck = BuildInList(DomainRules.NotificationTypes);
        var entityTypeCheck = BuildInList(DomainRules.NotificationEntityTypes);

        modelBuilder.Entity<Notification>(notification =>
        {
            notification.ToTable(Db.Notifications);
            notification.HasKey(row => row.Id);

            notification.Property(row => row.RecipientProfileId).IsRequired();
            notification.Property(row => row.Type).HasMaxLength(40).IsRequired();
            notification.Property(row => row.Title).HasMaxLength(200).IsRequired();
            notification.Property(row => row.Message).HasMaxLength(1000).IsRequired();
            notification.Property(row => row.EntityType).HasMaxLength(20);
            notification.Property(row => row.IsRead).HasDefaultValue(false);

            // UpdatedAt is mapped for AuditInterceptor consistency even though
            // the original notify schema only stamped CreatedAt on insert.
            notification.HasIndex(row => new { row.RecipientProfileId, row.CreatedAt })
                .IsDescending(false, true);

            notification.HasIndex(row => row.RecipientProfileId)
                .HasFilter("[IsRead] = 0");

            notification.ToTable(table =>
            {
                table.HasCheckConstraint("CK_Notifications_Type", $"[Type] IN ({typeCheck})");
                table.HasCheckConstraint(
                    "CK_Notifications_EntityType",
                    $"[EntityType] IS NULL OR [EntityType] IN ({entityTypeCheck})");
            });
        });

        modelBuilder.Entity<UserPreferences>(preferences =>
        {
            preferences.ToTable(Db.UserPreferences);
            preferences.HasKey(row => row.ProfileId);

            preferences.Property(row => row.MutedTypesRaw)
                .HasColumnName("MutedNotificationTypes")
                .HasMaxLength(400)
                .IsRequired();

            preferences.Ignore(row => row.MutedNotificationTypes);

            preferences.Property(row => row.CreatedAt).IsRequired();
            preferences.Property(row => row.UpdatedAt).IsRequired();
        });
    }

    private static string BuildInList(IReadOnlyList<string> values) =>
        string.Join(", ", values.Select(value => $"'{value}'"));
}
