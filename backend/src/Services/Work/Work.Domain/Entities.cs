namespace Work.Domain;

public sealed class WorkTask : Entity, ISoftDeletable, IHasBusinessCode, Persistence.IAuditHistorySource
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid ProjectId { get; set; }
    public Guid DeveloperId { get; set; }
    public Guid? MentorId { get; set; }
    public string Priority { get; set; } = "medium";
    public string Status { get; set; } = DomainRules.TaskNotStarted;
    public DateOnly CreatedDate { get; set; }
    public DateOnly? DueDate { get; set; }
    public decimal? EstimatedHours { get; set; }
    public decimal ActualHours { get; set; }
    public int WorkedDays { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }

    public ICollection<DailyUpdate> DailyUpdates { get; set; } = [];

    string Persistence.IAuditHistorySource.HistoryTableName => "tasks";

    public string GetHistorySubject() =>
        Name.Length <= 120 ? Name : Name[..120];

    Guid? Persistence.IAuditHistorySource.HistorySubjectDeveloperId => DeveloperId;
}

public sealed class DailyUpdate : Entity, ISoftDeletable, Persistence.IAuditHistorySource
{
    public Guid DeveloperId { get; set; }
    public Guid ProjectId { get; set; }
    public Guid? TaskId { get; set; }
    public DateOnly EntryDate { get; set; }
    public string TaskTitle { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? WorkDone { get; set; }
    public string? PlannedWork { get; set; }
    public string Status { get; set; } = DomainRules.TaskInProgress;
    public string Priority { get; set; } = "medium";
    public int Progress { get; set; }
    public decimal? HoursSpent { get; set; }
    public decimal? EstimatedHours { get; set; }
    public bool IsBlocked { get; set; }
    public string? BlockerDescription { get; set; }
    public string? Remarks { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }

    public WorkTask? Task { get; set; }

    string Persistence.IAuditHistorySource.HistoryTableName => "daily_updates";

    public string GetHistorySubject()
    {
        var title = TaskTitle.Trim();
        return title.Length <= 120 ? title : title[..120];
    }

    Guid? Persistence.IAuditHistorySource.HistorySubjectDeveloperId => DeveloperId;
}

public sealed class Feedback : Entity, ISoftDeletable, IHasBusinessCode, Persistence.IAuditHistorySource
{
    public string Code { get; set; } = string.Empty;
    public Guid DeveloperId { get; set; }
    public Guid? MentorId { get; set; }
    public Guid? ProjectId { get; set; }
    public Guid? TaskId { get; set; }
    public DateOnly FeedbackDate { get; set; }
    public string Comment { get; set; } = string.Empty;
    public string? ProgressUpdate { get; set; }
    public string? Blockers { get; set; }
    public string? Recommendations { get; set; }
    public Guid? AuthorProfileId { get; set; }
    public string AuthorRole { get; set; } = DomainRules.RoleDeveloper;
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? DeletedBy { get; set; }

    public WorkTask? Task { get; set; }

    string Persistence.IAuditHistorySource.HistoryTableName => "feedback";

    public string GetHistorySubject()
    {
        var text = Comment.Trim();
        return text.Length <= 120 ? text : text[..120];
    }

    Guid? Persistence.IAuditHistorySource.HistorySubjectDeveloperId => DeveloperId;
}

public sealed class RecordHistory
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public string TableName { get; set; } = string.Empty;
    public Guid RecordId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public Guid? SubjectDeveloperId { get; set; }
    public Guid? ChangedBy { get; set; }
    public string ChangedByName { get; set; } = string.Empty;
    public DateTimeOffset ChangedAt { get; set; }
    public string Changes { get; set; } = "{}";
}
