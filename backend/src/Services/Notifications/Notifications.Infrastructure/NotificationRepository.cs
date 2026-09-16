using Notifications.Application;
using Notifications.Domain;

using Microsoft.EntityFrameworkCore;

namespace Notifications.Infrastructure;

public sealed class NotificationRepository(NotificationsDbContext context) : INotificationRepository
{
    public async Task<IReadOnlyList<Notification>> ListForRecipientAsync(
        Guid recipientProfileId,
        int limit,
        CancellationToken cancellationToken = default) =>
        await context.Notifications
            .AsNoTracking()
            .Where(row => row.RecipientProfileId == recipientProfileId)
            .OrderByDescending(row => row.CreatedAt)
            .ThenByDescending(row => row.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public Task<int> CountUnreadAsync(
        Guid recipientProfileId,
        CancellationToken cancellationToken = default) =>
        context.Notifications.CountAsync(
            row => row.RecipientProfileId == recipientProfileId && !row.IsRead,
            cancellationToken);

    public Task<Notification?> FindForRecipientAsync(
        Guid notificationId,
        Guid recipientProfileId,
        CancellationToken cancellationToken = default) =>
        context.Notifications.FirstOrDefaultAsync(
            row => row.Id == notificationId && row.RecipientProfileId == recipientProfileId,
            cancellationToken);

    public async Task MarkAllReadAsync(
        Guid recipientProfileId,
        CancellationToken cancellationToken = default)
    {
        await context.Notifications
            .Where(row => row.RecipientProfileId == recipientProfileId && !row.IsRead)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(row => row.IsRead, true),
                cancellationToken);
    }

    public void Add(Notification notification) => context.Notifications.Add(notification);

    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<string>>> GetMutedTypesByProfileIdsAsync(
        IReadOnlyCollection<Guid> profileIds,
        CancellationToken cancellationToken = default)
    {
        if (profileIds.Count == 0)
        {
            return new Dictionary<Guid, IReadOnlyList<string>>();
        }

        var rows = await context.UserPreferences
            .AsNoTracking()
            .Where(row => profileIds.Contains(row.ProfileId))
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(
            row => row.ProfileId,
            row => row.MutedNotificationTypes);
    }

    public Task<UserPreferences?> FindPreferencesAsync(
        Guid profileId,
        CancellationToken cancellationToken = default) =>
        context.UserPreferences.FirstOrDefaultAsync(row => row.ProfileId == profileId, cancellationToken);

    public void AddOrUpdatePreferences(UserPreferences preferences)
    {
        var tracked = context.UserPreferences.Local.FirstOrDefault(row => row.ProfileId == preferences.ProfileId);

        if (tracked is not null)
        {
            tracked.MutedNotificationTypes = preferences.MutedNotificationTypes;
            return;
        }

        var existing = context.UserPreferences.Find(preferences.ProfileId);

        if (existing is null)
        {
            context.UserPreferences.Add(preferences);
        }
        else
        {
            existing.MutedNotificationTypes = preferences.MutedNotificationTypes;
        }
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken = default) =>
        context.SaveChangesAsync(cancellationToken);
}
