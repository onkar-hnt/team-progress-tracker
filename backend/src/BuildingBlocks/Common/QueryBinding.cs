namespace Common;

/// <summary>
/// The frontend sends list filters as repeated query parameters
/// (?developerIds=a&amp;developerIds=b). An absent parameter means no filter;
/// an explicitly empty one means match nothing, which the Postgres functions
/// signalled the same way and which some screens depend on.
/// </summary>
public static class QueryBinding
{
    public static IReadOnlyList<Guid>? Guids(string? raw)
    {
        if (raw is null)
        {
            return null;
        }

        var parts = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return [.. parts.Select(part =>
            Guid.TryParse(part, out var id) ? id : Guid.Empty).Where(id => id != Guid.Empty)];
    }

    public static IReadOnlyList<string>? Strings(string? raw)
    {
        if (raw is null)
        {
            return null;
        }

        return [.. raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];
    }
}
