namespace Team.Application;

/// <summary>
/// When a day may be accounted for as leave, and who may say so. These are the
/// leave_days_not_far_ahead check and the leave_days insert and delete policies
/// the Postgres schema used to carry.
/// </summary>
public static class LeaveDayRules
{
    /// <summary>
    /// Tomorrow, not today, because the application works in the reader's own
    /// calendar day and the server counts in UTC. An evening in a zone ahead of
    /// UTC is already the next date locally, and refusing that would refuse a
    /// legitimate "I am on leave today". Beyond that a date is a typo.
    /// </summary>
    public static bool IsWithinReach(DateOnly date, DateOnly today) =>
        date <= today.AddDays(1);

    /// <summary>
    /// Writing is narrower than reading. Marking somebody else's day as leave
    /// is a statement about them, so it stays with the person themselves and
    /// with an administrator: a mentor who believes a day was leave asks for an
    /// update instead, which is what a reminder is for.
    /// </summary>
    public static bool CanWriteFor(AccessScope scope, Guid developerId) =>
        scope.IsAdmin || scope.DeveloperId == developerId;

    public static void RequireWithinReach(DateOnly date, DateOnly today)
    {
        if (!IsWithinReach(date, today))
        {
            throw new ValidationFailedException(
                "That date is too far ahead to mark as leave.");
        }
    }

    public static void RequireCanWriteFor(AccessScope scope, Guid developerId)
    {
        if (!CanWriteFor(scope, developerId))
        {
            throw new ForbiddenException(
                "Only that employee or an administrator can account for their day.");
        }
    }
}
