using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace Work.Infrastructure;

public sealed class WorkConnectionFactory(IConfiguration configuration)
{
    public async Task<SqlConnection> OpenAsync(CancellationToken cancellationToken = default)
    {
        var connection = new SqlConnection(configuration.GetConnectionString("DefaultConnection"));
        await connection.OpenAsync(cancellationToken);

        return connection;
    }
}
