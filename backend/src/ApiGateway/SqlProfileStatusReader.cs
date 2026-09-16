using Microsoft.Data.SqlClient;

using SharedKernel;

namespace ApiGateway;

/// <summary>
/// Reads login status straight from identity.Profiles so the gateway can refuse
/// deactivated people without calling Identity over HTTP on every request.
/// </summary>
public sealed class SqlProfileStatusReader(GatewayConnectionFactory connections)
{
    public async Task<string?> GetStatusAsync(Guid profileId, CancellationToken cancellationToken = default)
    {
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = $"""
            SELECT Status
              FROM [{Db.Identity}].[{Db.Profiles}]
             WHERE Id = @profileId
            """;
        command.Parameters.Add(new SqlParameter("@profileId", profileId));

        var result = await command.ExecuteScalarAsync(cancellationToken);

        return result is null or DBNull ? null : (string)result;
    }
}
