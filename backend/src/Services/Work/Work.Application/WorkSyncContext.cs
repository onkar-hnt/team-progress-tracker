namespace Work.Application;

/// <summary>
/// Per-request flags so R3/R4 status sync and work_blocked notifications do not
/// ping-pong the way Postgres used pg_trigger_depth() to break cycles.
/// </summary>
public sealed class WorkSyncContext
{
    public bool SuppressEntryToTaskStatusSync { get; set; }

    public bool SuppressWorkBlockedNotification { get; set; }
}
