namespace Reporting.Application;

public class ReportDateRangeQuery
{
    public string? From { get; init; }

    public string? To { get; init; }
}

public sealed class ScopedReportQuery : ReportDateRangeQuery
{
    public Guid? ProjectId { get; init; }
}
