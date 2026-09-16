namespace Persistence;

/// <summary>
/// Resolves the actor for a change-log row. Work reads display names from
/// identity profiles; Team can register the same resolver against one database.
/// </summary>
public interface IChangeHistoryActorResolver
{
    Task<(Guid? ProfileId, string DisplayName)> ResolveAsync(CancellationToken cancellationToken = default);
}
