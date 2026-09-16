using System.Text.Json;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

using SharedKernel;

namespace Persistence;

/// <summary>
/// Replaces Postgres record_change: one history row per meaningful entity
/// change on SaveChanges. Ignores derived effort columns and audit stamps so
/// the log stays readable.
/// </summary>
public sealed class ChangeHistoryInterceptor(
    IClock clock,
    IChangeHistoryActorResolver actorResolver) : SaveChangesInterceptor
{
    private static readonly HashSet<string> IgnoredProperties =
    [
        nameof(Entity.Id),
        nameof(Entity.CreatedAt),
        nameof(Entity.UpdatedAt),
        "Code",
        nameof(ISoftDeletable.DeletedAt),
        nameof(ISoftDeletable.DeletedBy),
        "ActualHours",
        "WorkedDays",
    ];

    private (Guid? ProfileId, string DisplayName)? _actor;

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        await ApplyAsync(eventData.Context, cancellationToken);
        return await base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        ApplyAsync(eventData.Context, CancellationToken.None).GetAwaiter().GetResult();
        return base.SavingChanges(eventData, result);
    }

    private async Task ApplyAsync(DbContext? context, CancellationToken cancellationToken)
    {
        if (context is not IRecordHistorySink sink)
        {
            return;
        }

        var entries = context.ChangeTracker.Entries()
            .Where(entry => entry.Entity is IAuditHistorySource)
            .ToList();

        if (entries.Count == 0)
        {
            return;
        }

        _actor ??= await actorResolver.ResolveAsync(cancellationToken);
        var (profileId, displayName) = _actor.Value;
        var changedAt = clock.Now;

        foreach (var entry in entries)
        {
            var source = (IAuditHistorySource)entry.Entity;
            var action = ResolveAction(entry);
            if (action is null)
            {
                continue;
            }

            var changesJson = action == "create" || action is "delete" or "restore"
                ? "{}"
                : BuildChangesJson(entry);

            if (action == "update" && changesJson == "{}")
            {
                continue;
            }

            sink.EnqueueRecordHistory(new PendingRecordHistory
            {
                TableName = source.HistoryTableName,
                RecordId = entry.Property(nameof(Entity.Id)).CurrentValue is Guid id ? id : Guid.Empty,
                Action = action,
                Subject = source.GetHistorySubject(),
                SubjectDeveloperId = source.HistorySubjectDeveloperId,
                ChangedBy = profileId,
                ChangedByName = displayName,
                ChangedAt = changedAt,
                Changes = changesJson,
            });
        }
    }

    private static string? ResolveAction(EntityEntry entry)
    {
        if (entry.State == EntityState.Added)
        {
            return "create";
        }

        if (entry.State == EntityState.Deleted)
        {
            return "delete";
        }

        if (entry.Entity is ISoftDeletable && entry.State == EntityState.Modified)
        {
            var deletedProp = entry.Property(nameof(ISoftDeletable.DeletedAt));
            var before = deletedProp.OriginalValue as DateTimeOffset?;
            var after = deletedProp.CurrentValue as DateTimeOffset?;

            if (before is null && after is not null)
            {
                return "delete";
            }

            if (before is not null && after is null)
            {
                return "restore";
            }
        }

        if (entry.State == EntityState.Modified)
        {
            return "update";
        }

        return null;
    }

    private static string BuildChangesJson(EntityEntry entry)
    {
        var changes = new List<object>();

        foreach (var property in entry.Properties)
        {
            if (IgnoredProperties.Contains(property.Metadata.Name))
            {
                continue;
            }

            if (!property.IsModified)
            {
                continue;
            }

            changes.Add(new
            {
                field = ToSnakeCase(property.Metadata.Name),
                before = FormatValue(property.OriginalValue),
                after = FormatValue(property.CurrentValue),
            });
        }

        return changes.Count == 0
            ? "{}"
            : JsonSerializer.Serialize(changes);
    }

    private static string? FormatValue(object? value) => value switch
    {
        null => null,
        DateOnly date => DateStrings.From(date),
        DateTimeOffset moment => DateStrings.From(moment),
        bool flag => flag ? "true" : "false",
        _ => Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture),
    };

    private static string ToSnakeCase(string name)
    {
        if (string.IsNullOrEmpty(name))
        {
            return name;
        }

        var chars = new List<char>(name.Length + 4);

        for (var index = 0; index < name.Length; index++)
        {
            var character = name[index];

            if (char.IsUpper(character) && index > 0)
            {
                chars.Add('_');
            }

            chars.Add(char.ToLowerInvariant(character));
        }

        return new string([.. chars]);
    }
}
