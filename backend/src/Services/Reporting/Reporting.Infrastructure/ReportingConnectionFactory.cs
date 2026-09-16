using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace Reporting.Infrastructure;

/// <summary>
/// Opens ADO connections for read-only SQL. Reporting owns no schema and has
/// no EF migrations — this is only a connection string holder.
/// </summary>
public sealed class ReportingConnectionFactory(IConfiguration configuration)
{
    public async Task<SqlConnection> OpenAsync(CancellationToken cancellationToken = default)
    {
        var connection = new SqlConnection(configuration.GetConnectionString("DefaultConnection"));
        await connection.OpenAsync(cancellationToken);

        return connection;
    }
}
