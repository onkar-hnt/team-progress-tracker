using SharedKernel;

namespace Notifications.Domain;

public sealed class Notification : Entity
{
    public Guid RecipientProfileId { get; set; }

    public string Type { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public string? EntityType { get; set; }

    public Guid? EntityId { get; set; }

    public bool IsRead { get; set; }
}
