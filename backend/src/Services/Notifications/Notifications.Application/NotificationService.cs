using Contracts;

using SharedKernel;

namespace Notifications.Application;

public sealed class NotificationService(
    INotificationRepository repository,
    ICurrentUser currentUser)
{
    public async Task<IReadOnlyList<NotificationDto>> ListAsync(
        int? limit,
        CancellationToken cancellationToken = default)
    {
        var take = Math.Clamp(limit ?? 20, 1, 200);
        var rows = await repository.ListForRecipientAsync(currentUser.ProfileId, take, cancellationToken);

        return rows.Select(Map).ToList();
    }

    public Task<int> UnreadCountAsync(CancellationToken cancellationToken = default) =>
        repository.CountUnreadAsync(currentUser.ProfileId, cancellationToken);

    public async Task MarkReadAsync(Guid notificationId, CancellationToken cancellationToken = default)
    {
        var row = await repository.FindForRecipientAsync(
            notificationId,
            currentUser.ProfileId,
            cancellationToken);

        if (row is null)
        {
            throw new NotFoundException("That notification is not in your inbox.");
        }

        if (!row.IsRead)
        {
            row.IsRead = true;
            await repository.SaveChangesAsync(cancellationToken);
        }
    }

    public Task MarkAllReadAsync(CancellationToken cancellationToken = default) =>
        repository.MarkAllReadAsync(currentUser.ProfileId, cancellationToken);

    public async Task<NotificationPreferencesDto> GetPreferencesAsync(
        CancellationToken cancellationToken = default)
    {
        var row = await repository.FindPreferencesAsync(currentUser.ProfileId, cancellationToken);

        return new NotificationPreferencesDto
        {
            MutedNotificationTypes = row?.MutedNotificationTypes ?? [],
        };
    }

    public async Task<NotificationPreferencesDto> SavePreferencesAsync(
        NotificationPreferencesDto dto,
        CancellationToken cancellationToken = default)
    {
        var existing = await repository.FindPreferencesAsync(currentUser.ProfileId, cancellationToken);

        var preferences = existing ?? new Domain.UserPreferences { ProfileId = currentUser.ProfileId };
        preferences.MutedNotificationTypes = dto.MutedNotificationTypes;

        repository.AddOrUpdatePreferences(preferences);
        await repository.SaveChangesAsync(cancellationToken);

        return new NotificationPreferencesDto
        {
            MutedNotificationTypes = preferences.MutedNotificationTypes,
        };
    }

    private static NotificationDto Map(Domain.Notification row) => new()
    {
        Id = row.Id,
        Type = row.Type,
        Title = row.Title,
        Message = row.Message,
        EntityType = row.EntityType,
        EntityId = row.EntityId,
        IsRead = row.IsRead,
        CreatedAt = DateStrings.From(row.CreatedAt),
    };
}
