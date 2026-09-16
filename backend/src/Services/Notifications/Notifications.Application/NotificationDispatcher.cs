using Contracts;

using Notifications.Domain;

namespace Notifications.Application;

/// <summary>
/// Persists notification rows the Work service already decided to send. Delivery
/// rules (skip actor, respect mutes) run there, not here.
/// </summary>
public sealed class NotificationDispatcher(INotificationRepository repository) : INotificationPublisher
{
    public async Task PublishAsync(
        IReadOnlyCollection<NotificationRequest> requests,
        CancellationToken cancellationToken = default)
    {
        if (requests.Count == 0)
        {
            return;
        }

        foreach (var request in requests)
        {
            if (request.RecipientProfileId == Guid.Empty)
            {
                continue;
            }

            repository.Add(new Notification
            {
                RecipientProfileId = request.RecipientProfileId,
                Type = request.Type,
                Title = request.Title,
                Message = request.Message,
                EntityType = request.EntityType,
                EntityId = request.EntityId,
                IsRead = false,
            });
        }

        await repository.SaveChangesAsync(cancellationToken);
    }
}
