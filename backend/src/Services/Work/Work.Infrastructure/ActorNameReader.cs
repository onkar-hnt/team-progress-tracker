using Contracts;

using Persistence;

namespace Work.Infrastructure;

/// <summary>
/// Reads the caller's display name from identity profiles, by way of the
/// resolver the change log already uses: the question is the same one, and one
/// query answering it twice per request is better than two spellings of it.
/// </summary>
public sealed class ActorNameReader(IChangeHistoryActorResolver actors) : IActorNameReader
{
    public async Task<string> GetDisplayNameAsync(CancellationToken cancellationToken = default)
    {
        var (_, displayName) = await actors.ResolveAsync(cancellationToken);

        return displayName;
    }
}
