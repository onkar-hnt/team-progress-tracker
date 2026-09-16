namespace SharedKernel;

/// <summary>
/// Schema and table names, in one place because more than one service reads
/// some of them. Each service owns its schema and is the only thing that
/// writes it; the few crossings are named contracts (ITeamDirectory,
/// IRosterGateway) rather than ad-hoc queries, so the names have to agree.
/// </summary>
public static class Db
{
    public const string Identity = "identity";
    public const string Team = "team";
    public const string Work = "work";
    public const string Notify = "notify";

    public const string Profiles = "Profiles";
    public const string Developers = "Developers";
    public const string Mentors = "Mentors";
    public const string MentorAssignments = "MentorAssignments";
    public const string Projects = "Projects";
    public const string ProjectDevelopers = "ProjectDevelopers";
    public const string Tasks = "Tasks";
    public const string DailyUpdates = "DailyUpdates";
    public const string Feedback = "Feedback";
    public const string RecordHistory = "RecordHistory";
    public const string Notifications = "Notifications";
    public const string UserPreferences = "UserPreferences";
}

public interface IClock
{
    DateTimeOffset Now { get; }
}

public sealed class SystemClock : IClock
{
    public DateTimeOffset Now => DateTimeOffset.UtcNow;
}
