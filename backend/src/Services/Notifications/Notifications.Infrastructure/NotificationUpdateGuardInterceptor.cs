using Notifications.Domain;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Notifications.Infrastructure;

/// <summary>
/// Replaces Postgres guard_notification_update: a notification row may only
/// change IsRead after insert, never Title, Message, or Type.
/// </summary>
public sealed class NotificationUpdateGuardInterceptor : SaveChangesInterceptor
{
    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        Guard(eventData.Context);
        return base.SavingChanges(eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Guard(eventData.Context);
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private static void Guard(DbContext? context)
    {
        if (context is null)
        {
            return;
        }

        foreach (var entry in context.ChangeTracker.Entries<Notification>()
                     .Where(row => row.State == EntityState.Modified))
        {
            foreach (var property in entry.Properties)
            {
                if (property.Metadata.Name is nameof(Notification.IsRead) or nameof(Notification.UpdatedAt))
                {
                    continue;
                }

                property.IsModified = false;
            }
        }
    }
}
