namespace SharedKernel;

/// <summary>
/// Values the database used to enforce with CHECK constraints, and the two
/// numbers its functions returned. The frontend ships the same lists in
/// src/models, so changing one without the other breaks a screen.
/// </summary>
public static class DomainRules
{
    public const string RoleAdmin = "admin";
    public const string RoleMentor = "mentor";
    public const string RoleDeveloper = "developer";

    public static readonly string[] Roles = [RoleAdmin, RoleMentor, RoleDeveloper];

    public const string ProfileActive = "active";
    public const string ProfileInactive = "inactive";

    public static readonly string[] ProfileStatuses = [ProfileActive, ProfileInactive];

    public const string TaskNotStarted = "not-started";
    public const string TaskInProgress = "in-progress";
    public const string TaskCompleted = "completed";
    public const string TaskBlocked = "blocked";

    public static readonly string[] TaskStatuses =
        [TaskNotStarted, TaskInProgress, TaskCompleted, TaskBlocked];

    public static readonly string[] TaskPriorities = ["low", "medium", "high", "critical"];

    public static readonly string[] ProjectStatuses = ["planned", "active", "on-hold", "completed"];

    public const string NotificationDailyUpdateSubmitted = "daily_update_submitted";
    public const string NotificationFeedbackAdded = "feedback_added";
    public const string NotificationTaskAssigned = "task_assigned";
    public const string NotificationTaskCommentAdded = "task_comment_added";
    public const string NotificationTaskReassigned = "task_reassigned";
    public const string NotificationTaskStatusChanged = "task_status_changed";
    public const string NotificationWorkBlocked = "work_blocked";

    public static readonly string[] NotificationTypes =
    [
        NotificationDailyUpdateSubmitted,
        NotificationFeedbackAdded,
        NotificationTaskAssigned,
        NotificationTaskCommentAdded,
        NotificationTaskReassigned,
        NotificationTaskStatusChanged,
        NotificationWorkBlocked,
    ];

    public static readonly string[] NotificationEntityTypes = ["daily_update", "feedback", "task"];

    public static readonly string[] HistoryActions = ["create", "update", "delete", "restore"];

    public static readonly string[] HistoryTables =
        ["daily_updates", "developers", "feedback", "mentors", "projects", "tasks"];

    /// <summary>A day of work, when somebody logged a day but not its hours.</summary>
    public const decimal StandardWorkingHours = 8m;

    /// <summary>Days a change log line, or a deleted record, is kept.</summary>
    public const int RetentionDays = 15;

    /// <summary>Progress a status implies, or null where any value is legitimate.</summary>
    public static int? ProgressForStatus(string status) => status switch
    {
        TaskCompleted => 100,
        TaskNotStarted => 0,
        _ => null,
    };
}
