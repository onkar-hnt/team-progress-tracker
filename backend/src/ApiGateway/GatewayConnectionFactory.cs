using Microsoft.Data.SqlClient;

namespace ApiGateway;

/// <summary>
/// Opens read-only SQL connections for cross-schema checks. The gateway owns
/// no tables and runs no migrations — it only needs the shared connection string.
/// </summary>
public sealed class GatewayConnectionFactory(IConfiguration configuration)
{
    public async Task<SqlConnection> OpenAsync(CancellationToken cancellationToken = default)
    {
        var connection = new SqlConnection(configuration.GetConnectionString("DefaultConnection"));
        await connection.OpenAsync(cancellationToken);

        return connection;
    }
}
