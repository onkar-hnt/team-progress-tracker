using Work.Application.Rules;

namespace Work.Application;

/// <summary>
/// Asks one developer for their daily update. This is the
/// send_daily_update_reminder function the Postgres schema used to carry, and
/// it exists for the same reason: a notification addressed to somebody else is
/// a forgery unless something has checked who is asking.
/// </summary>
public sealed class DailyUpdateReminderService(
    IAccessScopeProvider scopeProvider,
    ICurrentUser currentUser,
    ITeamDirectory teamDirectory,
    INotificationPublisher notifications,
    IActorNameReader actorName)
{
    /// <summary>
    /// Returns nothing, on purpose. Whether a notification was written is not
    /// the sender's business: the recipient may have muted reminders, and the
    /// publisher drops those silently by design.
    /// </summary>
    public async Task SendAsync(SendReminderRequest request, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        // The check is the read rule — whoever may see a developer's work may
        // ask them for it. Not the project-narrowed rule: a day with no update
        // names no project, so there is no project boundary to apply.
        if (!scope.IsPrivileged)
        {
            throw new ForbiddenException("You cannot send a reminder to this developer.");
        }

        scope.RequireDeveloperVisible(request.DeveloperId);

        var developer = await teamDirectory.FindDeveloperAsync(request.DeveloperId, cancellationToken)
            ?? throw new NotFoundException("That employee is no longer on the roster.");

        // Nothing to write to rather than nothing to say, so it is worth
        // saying: a developer with no login cannot be reminded in the
        // application at all.
        if (developer.ProfileId is not Guid recipientProfileId)
        {
            throw new ValidationFailedException("That employee has no login to notify.");
        }

        var sender = await actorName.GetDisplayNameAsync(cancellationToken);

        var pending = new WorkNotificationComposer(currentUser, teamDirectory)
            .ForDailyUpdateReminder(
                recipientProfileId,
                string.IsNullOrWhiteSpace(sender) ? "Your mentor" : sender,
                request.Message);

        await notifications.PublishAsync(pending, cancellationToken);
    }
}
