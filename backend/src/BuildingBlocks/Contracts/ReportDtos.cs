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

/// <summary>How one working day was accounted for.</summary>
public sealed record UpdateDayDto
{
    public required string Date { get; init; }

    /// <summary>One of leave, missing or submitted.</summary>
    public required string State { get; init; }

    /// <summary>The note left with a leave day, when there is one.</summary>
    public string? Note { get; init; }
}

public sealed record DeveloperUpdateCoverageDto
{
    public required Guid DeveloperId { get; init; }
    public required string DeveloperName { get; init; }

    /// <summary>Every working day in the range, newest first.</summary>
    public IReadOnlyList<UpdateDayDto> Days { get; init; } = [];

    public IReadOnlyList<string> MissingDates { get; init; } = [];
    public IReadOnlyList<string> LeaveDates { get; init; } = [];

    public int SubmittedCount { get; init; }
    public int MissingCount { get; init; }
    public int LeaveCount { get; init; }

    /// <summary>The most recent day in range that has an update, if any has.</summary>
    public string? LastSubmittedDate { get; init; }
}

public sealed record UpdateCoverageTotalsDto
{
    public int DevelopersWithGaps { get; init; }
    public int MissingDays { get; init; }
    public int LeaveDays { get; init; }
}

/// <summary>
/// Which working days each visible developer has accounted for, and how. A
/// calculation over rows that already exist rather than state written when a
/// day passes, so a day filled in later stops being missing the moment the
/// entry lands.
/// </summary>
public sealed record UpdateCoverageDto
{
    public required string From { get; init; }
    public required string To { get; init; }
    public IReadOnlyList<DeveloperUpdateCoverageDto> Developers { get; init; } = [];
    public UpdateCoverageTotalsDto Totals { get; init; } = new();
}
