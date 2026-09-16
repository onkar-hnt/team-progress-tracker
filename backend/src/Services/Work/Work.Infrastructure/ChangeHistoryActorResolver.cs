using Microsoft.Data.SqlClient;

using Persistence;

using SharedKernel;

namespace Work.Infrastructure;

public sealed class ChangeHistoryActorResolver(
    WorkConnectionFactory connections,
    ICurrentUser currentUser) : IChangeHistoryActorResolver
{
    private (Guid? ProfileId, string DisplayName)? _cached;

    public async Task<(Guid? ProfileId, string DisplayName)> ResolveAsync(
        CancellationToken cancellationToken = default)
    {
        if (_cached is not null)
        {
            return _cached.Value;
        }

        if (!currentUser.IsAuthenticated)
        {
            _cached = (null, string.Empty);
            return _cached.Value;
        }

        const string sql = $"""
            SELECT DisplayName
              FROM [{Db.Identity}].[{Db.Profiles}]
             WHERE Id = @profileId
            """;

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.Add(new SqlParameter("@profileId", currentUser.ProfileId));

        var scalar = await command.ExecuteScalarAsync(cancellationToken);
        var name = scalar is string display && !string.IsNullOrWhiteSpace(display)
            ? display
            : currentUser.Email;

        _cached = (currentUser.ProfileId, name);
        return _cached.Value;
    }
}
