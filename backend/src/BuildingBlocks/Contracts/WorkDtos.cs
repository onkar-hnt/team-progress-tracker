namespace Contracts;

public sealed record AssignedTaskDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Code { get; init; }
    public string? Description { get; init; }
    public required Guid ProjectId { get; init; }
    public required Guid DeveloperId { get; init; }
    public Guid? MentorId { get; init; }
    public required string Priority { get; init; }
    public required string Status { get; init; }
    public required string CreatedDate { get; init; }
    public string? DueDate { get; init; }
    public decimal? EstimatedHours { get; init; }

    /// <summary>Distinct days with a daily update. Maintained server side.</summary>
    public required int WorkedDays { get; init; }

    /// <summary>Reported hours per day, or eight for a day logged without them.</summary>
    public required decimal ActualHours { get; init; }

    public required string UpdatedAt { get; init; }
}

public sealed record SaveTaskRequest
{
    public string Name { get; init; } = string.Empty;
    public string? Code { get; init; }
    public string? Description { get; init; }
    public Guid ProjectId { get; init; }
    public Guid DeveloperId { get; init; }
    public Guid? MentorId { get; init; }
    public string Priority { get; init; } = "medium";
    public string Status { get; init; } = "not-started";
    public string? CreatedDate { get; init; }
    public string? DueDate { get; init; }
    public decimal? EstimatedHours { get; init; }
}

public sealed record TaskQuery
{
    public IReadOnlyList<Guid>? DeveloperIds { get; init; }
    public IReadOnlyList<Guid>? MentorIds { get; init; }
    public IReadOnlyList<Guid>? ProjectIds { get; init; }
    public IReadOnlyList<string>? Statuses { get; init; }
    public IReadOnlyList<string>? Priorities { get; init; }
    public string? DueOnOrBefore { get; init; }
    public int? Limit { get; init; }
}

public sealed record DailyWorkEntryDto
{
    public required Guid Id { get; init; }
    public required string Date { get; init; }
    public required Guid DeveloperId { get; init; }
    public required Guid ProjectId { get; init; }
    public Guid? TaskId { get; init; }
    public required string TaskTitle { get; init; }
    public string? Description { get; init; }
    public string? WorkDone { get; init; }
    public string? PlannedWork { get; init; }
    public required string Status { get; init; }
    public required string Priority { get; init; }
    public required int Progress { get; init; }
    public decimal? HoursSpent { get; init; }
    public decimal? EstimatedHours { get; init; }
    public required bool IsBlocked { get; init; }
    public string? BlockerDescription { get; init; }
    public string? Remarks { get; init; }
    public required string CreatedAt { get; init; }
    public required string UpdatedAt { get; init; }
}

public sealed record SaveDailyWorkEntryRequest
{
    public string Date { get; init; } = string.Empty;
    public Guid DeveloperId { get; init; }
    public Guid ProjectId { get; init; }
    public Guid? TaskId { get; init; }
    public string TaskTitle { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string? WorkDone { get; init; }
    public string? PlannedWork { get; init; }
    public string Status { get; init; } = "in-progress";
    public string Priority { get; init; } = "medium";
    public int Progress { get; init; }
    public decimal? HoursSpent { get; init; }
    public decimal? EstimatedHours { get; init; }
    public bool IsBlocked { get; init; }
    public string? BlockerDescription { get; init; }
    public string? Remarks { get; init; }
}

public sealed record DailyWorkQuery
{
    public string? DateFrom { get; init; }
    public string? DateTo { get; init; }
    public IReadOnlyList<Guid>? DeveloperIds { get; init; }
    public IReadOnlyList<Guid>? ProjectIds { get; init; }
    public IReadOnlyList<string>? Statuses { get; init; }
    public IReadOnlyList<string>? Priorities { get; init; }
    public bool? IsBlocked { get; init; }
    public int? Limit { get; init; }
}

/// <summary>
/// One entry in a task's conversation. Mentor comments, admin comments and a
/// developer's own replies are all rows here, told apart by AuthorRole.
/// </summary>
public sealed record MentorCommentDto
{
    public required Guid Id { get; init; }
    public required Guid DeveloperId { get; init; }
    public Guid? MentorId { get; init; }
    public Guid? AuthorProfileId { get; init; }
    public string? AuthorRole { get; init; }
    public Guid? TaskId { get; init; }
    public Guid? ProjectId { get; init; }
    public required string Date { get; init; }
    public required string Comment { get; init; }
    public string? ProgressUpdate { get; init; }
    public string? Blockers { get; init; }
    public string? Recommendations { get; init; }
    public required string CreatedAt { get; init; }
    public required string UpdatedAt { get; init; }
}

public sealed record SaveCommentRequest
{
    public Guid DeveloperId { get; init; }
    public Guid? MentorId { get; init; }
    public Guid? TaskId { get; init; }
    public Guid? ProjectId { get; init; }
    public string? Date { get; init; }
    public string Comment { get; init; } = string.Empty;
    public string? ProgressUpdate { get; init; }
    public string? Blockers { get; init; }
    public string? Recommendations { get; init; }
}

public sealed record CommentQuery
{
    public IReadOnlyList<Guid>? DeveloperIds { get; init; }
    public IReadOnlyList<Guid>? MentorIds { get; init; }
    public IReadOnlyList<Guid>? ProjectIds { get; init; }
    public IReadOnlyList<Guid>? TaskIds { get; init; }
    public string? DateFrom { get; init; }
    public string? DateTo { get; init; }
    public int? Limit { get; init; }
}

public sealed record SetTaskStatusRequest
{
    public string Status { get; init; } = string.Empty;
}
