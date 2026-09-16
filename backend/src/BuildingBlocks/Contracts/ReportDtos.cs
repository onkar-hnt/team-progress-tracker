namespace Contracts;

public sealed record ReportFilter
{
    public string? From { get; init; }
    public string? To { get; init; }
    public Guid? ProjectId { get; init; }
    public Guid? DeveloperId { get; init; }
}

public sealed record StatusSummaryDto
{
    public int Total { get; init; }
    public int NotStarted { get; init; }
    public int InProgress { get; init; }
    public int Completed { get; init; }
    public int Blocked { get; init; }
}

public sealed record DeveloperTotalsDto
{
    public required Guid DeveloperId { get; init; }
    public required string DeveloperName { get; init; }
    public int Entries { get; init; }
    public int DaysLogged { get; init; }
    public decimal HoursLogged { get; init; }
    public int CompletionRate { get; init; }
    public StatusSummaryDto Statuses { get; init; } = new();
    public int BlockedEntries { get; init; }
}

public sealed record ProjectTotalsDto
{
    public required Guid ProjectId { get; init; }
    public required string ProjectName { get; init; }
    public int Entries { get; init; }
    public int Contributors { get; init; }
    public decimal HoursLogged { get; init; }
    public int CompletionRate { get; init; }
    public StatusSummaryDto Statuses { get; init; } = new();
}

/// <summary>
/// Everything the Reports screen shows for a period, aggregated in the
/// database rather than over entries shipped to the browser.
/// </summary>
public sealed record TeamReportDto
{
    public required string From { get; init; }
    public required string To { get; init; }
    public StatusSummaryDto Statuses { get; init; } = new();
    public decimal HoursLogged { get; init; }
    public int CompletionRate { get; init; }
    public IReadOnlyList<DeveloperTotalsDto> Developers { get; init; } = [];
    public IReadOnlyList<ProjectTotalsDto> Projects { get; init; } = [];
}
