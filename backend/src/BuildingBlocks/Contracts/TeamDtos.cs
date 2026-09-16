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
    public Guid? MentorId { get; init; }
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
    public IReadOnlyList<Guid>? AssignedDeveloperIds { get; init; }
}
