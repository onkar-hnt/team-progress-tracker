using System.Data;

using Contracts;

using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

using Reporting.Application;

using SharedKernel;

namespace Reporting.Infrastructure;

public sealed class SqlUsageReader(
    ReportingConnectionFactory connections,
    IOptions<UsageOptions> usageOptions) : IUsageReader
{
    public async Task<ResourceUsageDto> ReadAsync(
        DateTimeOffset measuredAt,
        CancellationToken cancellationToken = default)
    {
        await using var connection = await connections.OpenAsync(cancellationToken);

        var (databaseBytes, logBytes) = await ReadFileSizesAsync(connection, cancellationToken);
        var tables = await ReadTableUsageAsync(connection, cancellationToken);
        var (accounts, activeAccounts) = await ReadAccountCountsAsync(connection, cancellationToken);
        var lastWriteAt = await ReadLastWriteAtAsync(connection, cancellationToken);

        return new ResourceUsageDto
        {
            MeasuredAt = measuredAt,
            DatabaseBytes = databaseBytes,
            LogBytes = logBytes,
            MaxDatabaseBytes = usageOptions.Value.MaxDatabaseBytes,
            Tables = tables,
            Accounts = accounts,
            ActiveAccounts = activeAccounts,
            LastWriteAt = lastWriteAt,
        };
    }

    private static async Task<(long DatabaseBytes, long LogBytes)> ReadFileSizesAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        const string sql = """
            SELECT
                COALESCE(SUM(CASE WHEN type_desc = N'ROWS' THEN CAST(size AS bigint) * 8192 END), 0) AS DatabaseBytes,
                COALESCE(SUM(CASE WHEN type_desc = N'LOG' THEN CAST(size AS bigint) * 8192 END), 0) AS LogBytes
              FROM sys.database_files
            """;

        await using var command = connection.CreateCommand();
        command.CommandText = sql;

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        if (!await reader.ReadAsync(cancellationToken))
        {
            return (0, 0);
        }

        return (reader.GetInt64(0), reader.GetInt64(1));
    }

    private static async Task<IReadOnlyList<TableUsageDto>> ReadTableUsageAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT
                SCHEMA_NAME(o.schema_id) + N'.' + o.name AS TableName,
                SUM(CASE WHEN ps.index_id IN (0, 1) THEN ps.row_count ELSE 0 END) AS RowCount,
                SUM(CAST(ps.reserved_page_count AS bigint)) * 8192 AS TotalBytes,
                SUM(CASE WHEN ps.index_id > 1 THEN CAST(ps.used_page_count AS bigint) ELSE 0 END) * 8192 AS IndexBytes
              FROM sys.objects o
              JOIN sys.dm_db_partition_stats ps ON o.object_id = ps.object_id
             WHERE o.type = N'U'
               AND SCHEMA_NAME(o.schema_id) IN (N'{Db.Identity}', N'{Db.Team}', N'{Db.Work}', N'{Db.Notify}')
             GROUP BY o.schema_id, o.name
             ORDER BY TotalBytes DESC
            """;

        await using var command = connection.CreateCommand();
        command.CommandText = sql;

        var tables = new List<TableUsageDto>();

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        while (await reader.ReadAsync(cancellationToken))
        {
            tables.Add(new TableUsageDto
            {
                Name = reader.GetString(0),
                Rows = reader.GetInt64(1),
                TotalBytes = reader.GetInt64(2),
                IndexBytes = reader.GetInt64(3),
            });
        }

        return tables;
    }

    private static async Task<(int Accounts, int ActiveAccounts)> ReadAccountCountsAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT
                COUNT(*) AS Accounts,
                SUM(CASE WHEN Status = @activeStatus THEN 1 ELSE 0 END) AS ActiveAccounts
              FROM [{Db.Identity}].[{Db.Profiles}]
            """;

        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.Add(new SqlParameter("@activeStatus", SqlDbType.NVarChar, 32)
        {
            Value = DomainRules.ProfileActive,
        });

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        if (!await reader.ReadAsync(cancellationToken))
        {
            return (0, 0);
        }

        return (reader.GetInt32(0), reader.GetInt32(1));
    }

    private static async Task<DateTimeOffset?> ReadLastWriteAtAsync(
        SqlConnection connection,
        CancellationToken cancellationToken)
    {
        var sql = $"""
            SELECT MAX(LastWrite) FROM (
                SELECT MAX(UpdatedAt) AS LastWrite FROM [{Db.Identity}].[{Db.Profiles}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Team}].[{Db.Developers}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Team}].[{Db.Mentors}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Team}].[{Db.MentorAssignments}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Team}].[{Db.Projects}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Work}].[{Db.Tasks}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Work}].[{Db.DailyUpdates}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Work}].[{Db.Feedback}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Notify}].[{Db.Notifications}]
                UNION ALL SELECT MAX(UpdatedAt) FROM [{Db.Notify}].[{Db.UserPreferences}]
            ) AS writes
            """;

        await using var command = connection.CreateCommand();
        command.CommandText = sql;

        var scalar = await command.ExecuteScalarAsync(cancellationToken);

        if (scalar is null or DBNull)
        {
            return null;
        }

        return (DateTimeOffset)scalar;
    }
}
