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
    public ICollection<ProjectMentor> ResponsibleMentors { get; set; } = [];
}

public sealed class ProjectDeveloper
{
    public Guid ProjectId { get; set; }
    public Guid DeveloperId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Project Project { get; set; } = null!;
    public Developer Developer { get; set; } = null!;
}

/// <summary>
/// A mentor who is responsible for a project. Project.MentorId still names the
/// one mentor who owns it; this is the full list, and it is what decides whose
/// work a mentor may read on that project.
/// </summary>
public sealed class ProjectMentor
{
    public Guid ProjectId { get; set; }
    public Guid MentorId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }

    public Project Project { get; set; } = null!;
    public Mentor Mentor { get; set; } = null!;
}

/// <summary>
/// A day a developer was on leave, which is why no daily update exists for
/// them. One row per developer per date, written by the person themselves or by
/// an administrator.
/// <para>
/// Deliberately not a daily update with a special title. An entry there is work
/// on a task, and <c>DailyUpdateTaskEnsurer</c>, <c>EntryStatusToTaskSynchronizer</c>
/// and <c>WorkNotificationComposer</c> all run on one; a day off would set all
/// of it going.
/// </para>
/// <para>
/// Not soft-deletable either. The row is a statement that a day was leave, and
/// the only undo is removing it: there is nothing else to keep.
/// </para>
/// </summary>
public sealed class LeaveDay : Entity
{
    public Guid DeveloperId { get; set; }
    public DateOnly LeaveDate { get; set; }

    /// <summary>
    /// Expected to be empty. The reason belongs to whoever took the leave; this
    /// exists so a note can be left, not so one can be required.
    /// </summary>
    public string? Note { get; set; }

    /// <summary>
    /// Who said so, which is not always whose day it was: an administrator may
    /// record it for somebody.
    /// </summary>
    public Guid? RecordedBy { get; set; }

    public Developer Developer { get; set; } = null!;
}
