namespace SharedKernel;

public abstract class Entity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}

/// <summary>
/// Deleting one of these puts it aside instead of destroying it. Nothing lists
/// a row with DeletedAt set except the Recently deleted screen, and the
/// retention job destroys it once it has sat there longer than
/// <see cref="DomainRules.RetentionDays"/>.
/// </summary>
public interface ISoftDeletable
{
    DateTimeOffset? DeletedAt { get; set; }
    Guid? DeletedBy { get; set; }
}

/// <summary>Carries a business code such as DEV004 or TSK021.</summary>
public interface IHasBusinessCode
{
    string Code { get; set; }
}
