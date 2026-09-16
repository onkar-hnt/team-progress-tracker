using SharedKernel;

namespace Reporting.Domain;

/// <summary>
/// A calendar window for report queries. Missing bounds default to the current
/// month through today, matching what the Reports screen sends when fields are blank.
/// </summary>
public sealed record ReportPeriod(DateOnly From, DateOnly To)
{
    public static ReportPeriod Resolve(string? from, string? to)
    {
        var end = string.IsNullOrWhiteSpace(to) ? DateStrings.Today() : DateStrings.ParseDate(to, "to");
        var start = string.IsNullOrWhiteSpace(from)
            ? new DateOnly(end.Year, end.Month, 1)
            : DateStrings.ParseDate(from, "from");

        if (start > end)
        {
            throw new ValidationFailedException("'from' must be on or before 'to'.");
        }

        return new ReportPeriod(start, end);
    }
}
