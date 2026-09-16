namespace Team.Domain;

public sealed class Developer : Entity, ISoftDeletable, IHasBusinessCode
{
    public string Code { get; set; } = string.Empty;
    public Guid? ProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? EmployeeId { get; set; }
    public string? Role { get; set; }
    public string? Location { get; set; }
    public bool Active { get; set; } = true;
    public string? Email { get; set; }
    public string? AccessRole { get; set; }
    public Guid? PrimaryProjectId { get; set; }
    public DateOnly? CreatedDate { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }

    public Project? PrimaryProject { get; set; }
}

public sealed class Mentor : Entity, ISoftDeletable, IHasBusinessCode
{
    public string Code { get; set; } = string.Empty;
    public Guid? ProfileId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool Active { get; set; } = true;
    public DateOnly? CreatedDate { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }
}

public sealed class MentorAssignment : Entity
{
    public Guid MentorId { get; set; }
    public Guid DeveloperId { get; set; }
    public DateOnly? AssignedDate { get; set; }
    public bool Active { get; set; } = true;

    public Mentor Mentor { get; set; } = null!;
    public Developer Developer { get; set; } = null!;
}

public sealed class Project : Entity, ISoftDeletable, IHasBusinessCode
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Client { get; set; }
    public string? Description { get; set; }
    public string Status { get; set; } = "planned";
    public bool Active { get; set; } = true;
    public DateOnly? StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public Guid? MentorId { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }

    public Mentor? Mentor { get; set; }
    public ICollection<ProjectDeveloper> Members { get; set; } = [];
}

public sealed class ProjectDeveloper
{
    public Guid ProjectId { get; set; }
    public Guid DeveloperId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Project Project { get; set; } = null!;
    public Developer Developer { get; set; } = null!;
}
