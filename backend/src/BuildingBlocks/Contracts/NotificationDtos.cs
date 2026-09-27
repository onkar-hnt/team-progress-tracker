namespace Contracts;

public sealed record NotificationDto
{
    public required Guid Id { get; init; }
    public required string Type { get; init; }
    public required string Title { get; init; }
    public required string Message { get; init; }
    public string? EntityType { get; init; }
    public Guid? EntityId { get; init; }
    public required bool IsRead { get; init; }
    public required string CreatedAt { get; init; }
}

public sealed record NotificationPreferencesDto
{
    public IReadOnlyList<string> MutedNotificationTypes { get; init; } = [];
}

/// <summary>
/// Asks the Notifications service to tell somebody about something. The rules
/// about whether it is actually delivered — never to the person who caused it,
/// never a type they muted — belong to that service, not to the caller.
/// </summary>
public sealed record NotificationRequest
{
    public required Guid RecipientProfileId { get; init; }
    public required string Type { get; init; }
    public required string Title { get; init; }
    public required string Message { get; init; }
    public string? EntityType { get; init; }
    public Guid? EntityId { get; init; }

    /// <summary>The profile that caused this, which is never notified of it.</summary>
    public Guid? ActorProfileId { get; init; }
}

public interface INotificationPublisher
{
    Task PublishAsync(
        IReadOnlyCollection<NotificationRequest> requests,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// The caller's own display name, for wording written on their behalf. A
/// notification a person sends by hand has to be attributed from their profile
/// rather than from anything they typed, so the name is read here and not sent.
/// </summary>
public interface IActorNameReader
{
    Task<string> GetDisplayNameAsync(CancellationToken cancellationToken = default);
}
