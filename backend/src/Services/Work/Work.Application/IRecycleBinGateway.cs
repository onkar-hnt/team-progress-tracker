namespace Work.Application;

public interface IRecycleBinGateway
{
    Task<IReadOnlyList<DeletedRecordDto>> ListTeamDeletedAsync(CancellationToken cancellationToken);

    Task RestoreTeamRowAsync(string kind, Guid id, CancellationToken cancellationToken);

    Task DestroyTeamRowAsync(string kind, Guid id, CancellationToken cancellationToken);
}
