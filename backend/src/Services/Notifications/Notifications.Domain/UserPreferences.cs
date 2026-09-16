using SharedKernel;

namespace Notifications.Domain;

/// <summary>
/// Per-profile delivery settings. The primary key is the profile id because
/// there is at most one row per person.
/// </summary>
public sealed class UserPreferences
{
    public Guid ProfileId { get; set; }

    /// <summary>
    /// The muted list as stored: one column, comma separated. Postgres had
    /// text[] and SQL Server has nothing equivalent, and a child table for a
    /// list of at most seven fixed strings would cost a join on every read.
    /// </summary>
    public string MutedTypesRaw { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>The same list as values. Not mapped; it reads and writes the column.</summary>
    public IReadOnlyList<string> MutedNotificationTypes
    {
        get => Split(MutedTypesRaw);
        set => MutedTypesRaw = string.Join(',', Validated(value));
    }

    private static IReadOnlyList<string> Split(string raw) =>
        string.IsNullOrWhiteSpace(raw)
            ? []
            : [.. raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];

    private static IReadOnlyList<string> Validated(IReadOnlyList<string>? types)
    {
        if (types is null || types.Count == 0)
        {
            return [];
        }

        var unknown = types.Where(type => !DomainRules.NotificationTypes.Contains(type)).ToList();

        if (unknown.Count > 0)
        {
            throw new ValidationFailedException(
                "That is not a kind of notification.",
                [.. unknown.Select(type => $"Unknown notification type '{type}'.")]);
        }

        return [.. types.Distinct()];
    }
}
