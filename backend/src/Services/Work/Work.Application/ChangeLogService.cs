namespace Work.Application;

public sealed class ChangeLogService(IWorkStore store, IAccessScopeProvider scopeProvider)
{
    public async Task<IReadOnlyList<ChangeRecordDto>> ListAsync(int limit, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var rows = await store.QueryChangeLogAsync(limit <= 0 ? 100 : limit, scope, cancellationToken);

        return [.. rows.Select(WorkMapping.ToDto)];
    }

    public async Task<IReadOnlyList<ChangeRecordDto>> ForRecordAsync(
        string kind,
        Guid recordId,
        CancellationToken cancellationToken)
    {
        if (!DomainRules.HistoryTables.Contains(kind))
        {
            throw new ValidationFailedException("That record kind is not recognised.");
        }

        var scope = await scopeProvider.GetAsync(cancellationToken);
        var rows = await store.QueryChangeLogForRecordAsync(kind, recordId, scope, cancellationToken);

        return [.. rows.Select(WorkMapping.ToDto)];
    }
}
