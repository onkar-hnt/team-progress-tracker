namespace Contracts;

// Field names and optionality mirror src/models/*.model.ts exactly, so the
// browser can keep its existing types. Dates are strings for the same reason:
// the frontend formats them, and 'yyyy-MM-dd' is what it already receives.

public sealed record DeveloperDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Code { get; init; }
    public string? EmployeeId { get; init; }

    /// <summary>Job title, not an access level.</summary>
    public string? Role { get; init; }

    public string? Location { get; init; }
    public required bool Active { get; init; }
    public string? Email { get; init; }
    public string? AccessRole { get; init; }
    public Guid? ProfileId { get; init; }
    public Guid? PrimaryProjectId { get; init; }
    public string? CreatedDate { get; init; }
    public string? DeletedAt { get; init; }
}

public sealed record SaveDeveloperRequest
{
    public string Name { get; init; } = string.Empty;
    public string? Code { get; init; }
    public string? EmployeeId { get; init; }
    public string? Role { get; init; }
    public string? Location { get; init; }
    public bool Active { get; init; } = true;
    public string? Email { get; init; }
    public string? AccessRole { get; init; }
    public Guid? ProfileId { get; init; }
    public Guid? PrimaryProjectId { get; init; }
    public string? CreatedDate { get; init; }
}

public sealed record MentorDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public required string Email { get; init; }
    public required bool Active { get; init; }
    public Guid? ProfileId { get; init; }
    public string? Code { get; init; }
    public string? CreatedDate { get; init; }
    public string? DeletedAt { get; init; }
}

public sealed record SaveMentorRequest
{
    public string Name { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public bool Active { get; init; } = true;
    public string? Code { get; init; }
    public string? CreatedDate { get; init; }
}

public sealed record MentorAssignmentDto
{
    public required Guid MentorId { get; init; }
    public required Guid DeveloperId { get; init; }
    public Guid? Id { get; init; }
    public string? AssignedDate { get; init; }
    public bool? Active { get; init; }
}

public sealed record SetMentorAssignmentsRequest
{
    public IReadOnlyList<Guid> DeveloperIds { get; init; } = [];
    public string? AssignedDate { get; init; }
}

public sealed record ProjectDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Client { get; init; }
    public required bool Active { get; init; }
    public string? Code { get; init; }
    public string? Description { get; init; }
    public required string Status { get; init; }
    public string? StartDate { get; init; }
    public string? EndDate { get; init; }
    /// <summary>Primary mentor, kept in step with the first id in MentorIds.</summary>
    public Guid? MentorId { get; init; }

    /// <summary>Every mentor responsible for the project. Empty when nobody is.</summary>
    public IReadOnlyList<Guid> MentorIds { get; init; } = [];

    public IReadOnlyList<Guid> AssignedDeveloperIds { get; init; } = [];
    public string? DeletedAt { get; init; }
}

public sealed record SaveProjectRequest
{
    public string Name { get; init; } = string.Empty;
    public string? Client { get; init; }
    public bool Active { get; init; } = true;
    public string? Code { get; init; }
    public string? Description { get; init; }
    public string Status { get; init; } = "planned";
    public string? StartDate { get; init; }
    public string? EndDate { get; init; }
    public Guid? MentorId { get; init; }
    public IReadOnlyList<Guid>? MentorIds { get; init; }
    public IReadOnlyList<Guid>? AssignedDeveloperIds { get; init; }
}

/// <summary>
/// A day a developer was on leave, and so owes no daily update. One row per
/// developer per date, which the database enforces, so marking a day twice is
/// a conflict rather than a duplicate.
/// </summary>
public sealed record LeaveDayDto
{
    public required Guid Id { get; init; }
    public required Guid DeveloperId { get; init; }
    public required string Date { get; init; }
    public string? Note { get; init; }

    /// <summary>The profile that marked the day, which may be an administrator.</summary>
    public Guid? RecordedBy { get; init; }

    public required string CreatedAt { get; init; }
}

public sealed record SaveLeaveDayRequest
{
    public Guid DeveloperId { get; init; }
    public string Date { get; init; } = string.Empty;
    public string? Note { get; init; }
}

public sealed record LeaveDayQuery
{
    public string? DateFrom { get; init; }
    public string? DateTo { get; init; }
    public IReadOnlyList<Guid>? DeveloperIds { get; init; }
}
