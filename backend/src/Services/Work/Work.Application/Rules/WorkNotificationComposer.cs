using Work.Domain;

namespace Work.Application.Rules;

/// <summary>Replaces Postgres enqueue_notification and its triggers (R8).</summary>
public sealed class WorkNotificationComposer(ICurrentUser currentUser, ITeamDirectory teamDirectory)
{
    public async Task<IReadOnlyList<NotificationRequest>> ForTaskCreatedAsync(
        WorkTask task,
        CancellationToken cancellationToken)
    {
        var developer = await teamDirectory.FindDeveloperAsync(task.DeveloperId, cancellationToken);

        if (developer?.ProfileId is not Guid profileId)
        {
            return [];
        }

        return
        [
            Build(
                profileId,
                DomainRules.NotificationTaskAssigned,
                "New task",
                $"{task.Name} is now yours.",
                "task",
                task.Id),
        ];
    }

    public async Task<IReadOnlyList<NotificationRequest>> ForTaskReassignedAsync(
        WorkTask task,
        CancellationToken cancellationToken)
    {
        var developer = await teamDirectory.FindDeveloperAsync(task.DeveloperId, cancellationToken);

        if (developer?.ProfileId is not Guid profileId)
        {
            return [];
        }

        return
        [
            Build(
                profileId,
                DomainRules.NotificationTaskReassigned,
                "New task",
                $"{task.Name} is now yours.",
                "task",
                task.Id),
        ];
    }

    public async Task<IReadOnlyList<NotificationRequest>> ForTaskStatusChangedAsync(
        WorkTask task,
        string fromStatus,
        string toStatus,
        CancellationToken cancellationToken)
    {
        var developer = await teamDirectory.FindDeveloperAsync(task.DeveloperId, cancellationToken);

        if (developer?.ProfileId is not Guid profileId)
        {
            return [];
        }

        var message =
            $"{task.Name}: {SentenceCaseStatus(fromStatus)} to {SentenceCaseStatus(toStatus)}.";

        return
        [
            Build(
                profileId,
                DomainRules.NotificationTaskStatusChanged,
                "Task status changed",
                message,
                "task",
                task.Id),
        ];
    }

    public async Task<IReadOnlyList<NotificationRequest>> ForCommentCreatedAsync(
        Feedback comment,
        CancellationToken cancellationToken)
    {
        var type = comment.TaskId is not null
            ? DomainRules.NotificationTaskCommentAdded
            : DomainRules.NotificationFeedbackAdded;

        var entityType = comment.TaskId is not null ? "task" : "feedback";
        var entityId = comment.TaskId ?? comment.Id;

        if (comment.AuthorRole == DomainRules.RoleDeveloper)
        {
            return await NotifyMentorsAsync(
                comment.DeveloperId,
                type,
                "New comment",
                "A developer left a comment.",
                entityType,
                entityId,
                cancellationToken);
        }

        var developer = await teamDirectory.FindDeveloperAsync(comment.DeveloperId, cancellationToken);

        if (developer?.ProfileId is not Guid profileId)
        {
            return [];
        }

        return
        [
            Build(profileId, type, "New comment", "Your mentor left a comment.", entityType, entityId),
        ];
    }

    public async Task<IReadOnlyList<NotificationRequest>> ForDailyUpdateCreatedAsync(
        DailyUpdate entry,
        CancellationToken cancellationToken)
    {
        var message = entry.IsBlocked
            ? $"Daily update for {DateStrings.From(entry.EntryDate)} (blocked)."
            : $"Daily update for {DateStrings.From(entry.EntryDate)}.";

        return await NotifyMentorsAsync(
            entry.DeveloperId,
            DomainRules.NotificationDailyUpdateSubmitted,
            "Daily update submitted",
            message,
            "daily_update",
            entry.Id,
            cancellationToken);
    }

    public async Task<IReadOnlyList<NotificationRequest>> ForWorkBlockedAsync(
        DailyUpdate entry,
        CancellationToken cancellationToken)
    {
        return await NotifyMentorsAsync(
            entry.DeveloperId,
            DomainRules.NotificationWorkBlocked,
            "Work blocked",
            $"Work blocked on {DateStrings.From(entry.EntryDate)}.",
            "daily_update",
            entry.Id,
            cancellationToken);
    }

    private async Task<IReadOnlyList<NotificationRequest>> NotifyMentorsAsync(
        Guid developerId,
        string type,
        string title,
        string message,
        string entityType,
        Guid entityId,
        CancellationToken cancellationToken)
    {
        var mentors = await teamDirectory.GetActiveMentorsForDeveloperAsync(developerId, cancellationToken);
        var requests = new List<NotificationRequest>();

        foreach (var mentor in mentors)
        {
            if (mentor.ProfileId is not Guid profileId)
            {
                continue;
            }

            requests.Add(Build(profileId, type, title, message, entityType, entityId));
        }

        return requests;
    }

    private NotificationRequest Build(
        Guid recipientProfileId,
        string type,
        string title,
        string message,
        string entityType,
        Guid entityId) =>
        new()
        {
            RecipientProfileId = recipientProfileId,
            Type = type,
            Title = title,
            Message = message,
            EntityType = entityType,
            EntityId = entityId,
            ActorProfileId = currentUser.IsAuthenticated ? currentUser.ProfileId : null,
        };

    internal static string SentenceCaseStatus(string slug)
    {
        var parts = slug.Split('-', StringSplitOptions.RemoveEmptyEntries);

        if (parts.Length == 0)
        {
            return slug;
        }

        parts[0] = char.ToUpperInvariant(parts[0][0]) + parts[0][1..];

        return string.Join(' ', parts);
    }
}
