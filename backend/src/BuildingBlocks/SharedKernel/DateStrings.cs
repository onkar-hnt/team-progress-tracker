using System.Globalization;

namespace SharedKernel;

/// <summary>
/// The browser receives dates as strings and always has: 'yyyy-MM-dd' for a
/// calendar date and ISO-8601 UTC for a timestamp. Formatting them here rather
/// than leaving it to the serialiser keeps that exact, which matters because
/// the frontend compares date strings directly in places.
/// </summary>
public static class DateStrings
{
    public const string DateFormat = "yyyy-MM-dd";

    public static string From(DateOnly date) =>
        date.ToString(DateFormat, CultureInfo.InvariantCulture);

    public static string? From(DateOnly? date) => date is null ? null : From(date.Value);

    public static string From(DateTimeOffset moment) =>
        moment.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    public static string? From(DateTimeOffset? moment) => moment is null ? null : From(moment.Value);

    public static DateOnly ParseDate(string value, string field)
    {
        if (!DateOnly.TryParseExact(value, DateFormat, CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var parsed))
        {
            throw new ValidationFailedException($"{field} must be a date like 2026-09-16.");
        }

        return parsed;
    }

    public static DateOnly? ParseOptionalDate(string? value, string field) =>
        string.IsNullOrWhiteSpace(value) ? null : ParseDate(value, field);

    public static DateOnly Today() => DateOnly.FromDateTime(DateTime.UtcNow);
}
