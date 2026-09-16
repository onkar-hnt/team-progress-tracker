using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

using SharedKernel;

namespace Persistence;

/// <summary>
/// Stamps CreatedAt and UpdatedAt, and turns a delete into a soft delete where
/// the entity supports it. Postgres did both with BEFORE triggers on every
/// table; doing it in one interceptor means no handler can forget, and no
/// handler needs to remember.
/// </summary>
public sealed class AuditInterceptor(IClock clock, ICurrentUser currentUser) : SaveChangesInterceptor
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

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.Entity is Entity entity)
            {
                StampTimes(entry, entity, now);
            }

            if (entry is { State: EntityState.Deleted, Entity: ISoftDeletable deletable })
            {
                entry.State = EntityState.Modified;
                deletable.DeletedAt = now;
                deletable.DeletedBy = ActorOrNull();

                if (entry.Entity is Entity touched)
                {
                    touched.UpdatedAt = now;
                }
            }
        }
    }

    private static void StampTimes(EntityEntry entry, Entity entity, DateTimeOffset now)
    {
        switch (entry.State)
        {
            case EntityState.Added:
                entity.CreatedAt = entity.CreatedAt == default ? now : entity.CreatedAt;
                entity.UpdatedAt = now;
                break;

            case EntityState.Modified:
                entity.UpdatedAt = now;
                entry.Property(nameof(Entity.CreatedAt)).IsModified = false;
                break;
        }
    }

    private Guid? ActorOrNull() => currentUser.IsAuthenticated ? currentUser.ProfileId : null;
}
