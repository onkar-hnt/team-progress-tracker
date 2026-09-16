using Notifications.Domain;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

using SharedKernel;

namespace Notifications.Infrastructure;

/// <summary>
/// UserPreferences does not inherit Entity, so the shared audit interceptor
/// never sees it. These timestamps are stamped here instead.
/// </summary>
public sealed class UserPreferencesAuditInterceptor(IClock clock) : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        Apply(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Apply(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private void Apply(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        var now = clock.Now;

        foreach (var entry in context.ChangeTracker.Entries<UserPreferences>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.CreatedAt = now;
                    entry.Entity.UpdatedAt = now;
                    break;

                case EntityState.Modified:
                    entry.Entity.UpdatedAt = now;
                    entry.Property(nameof(UserPreferences.CreatedAt)).IsModified = false;
                    break;
            }
        }
    }
}
