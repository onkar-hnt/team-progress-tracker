using Notifications.Domain;

namespace Notifications.Application;

public interface INotificationRepository
{
    Task<IReadOnlyList<Notification>> ListForRecipientAsync(
        Guid recipientProfileId,
        int limit,
        CancellationToken cancellationToken = default);

    Task<int> CountUnreadAsync(Guid recipientProfileId, CancellationToken cancellationToken = default);

    Task<Notification?> FindForRecipientAsync(
        Guid notificationId,
        Guid recipientProfileId,
        CancellationToken cancellationToken = default);

    Task MarkAllReadAsync(Guid recipientProfileId, CancellationToken cancellationToken = default);

    void Add(Notification notification);

    Task<IReadOnlyDictionary<Guid, IReadOnlyList<string>>> GetMutedTypesByProfileIdsAsync(
        IReadOnlyCollection<Guid> profileIds,
        CancellationToken cancellationToken = default);

    Task<UserPreferences?> FindPreferencesAsync(
        Guid profileId,
        CancellationToken cancellationToken = default);

    void AddOrUpdatePreferences(UserPreferences preferences);

    Task SaveChangesAsync(CancellationToken cancellationToken = default);
}
