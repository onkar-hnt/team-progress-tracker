using System.Data;

using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

using Reporting.Application;

using SharedKernel;

namespace Reporting.Infrastructure;

public sealed class SqlWorkEntryReader(
    ReportingConnectionFactory connections,
    ILogger<SqlWorkEntryReader> logger) : IWorkEntryReader
{
    public async Task<IReadOnlyList<WorkEntryRow>> ListAsync(
        DateOnly from,
        DateOnly to,
        Guid? projectId,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken = default)
    {
        if (developerIds is { Count: 0 })
        {
            return [];
        }

        var sql = $"""
            SELECT Id, DeveloperId, ProjectId, TaskId, EntryDate, TaskTitle, Status, Priority,
                   Progress, HoursSpent, EstimatedHours, IsBlocked
              FROM [{Db.Work}].[{Db.DailyUpdates}]
             WHERE DeletedAt IS NULL
               AND EntryDate >= @from AND EntryDate <= @to
               AND (@projectId IS NULL OR ProjectId = @projectId)
            """;

        var developerParameters = new List<SqlParameter>();

        if (developerIds is not null)
        {
            var placeholders = new List<string>();

            for (var index = 0; index < developerIds.Count; index++)
            {
                var name = $"@developer{index}";
                placeholders.Add(name);
                developerParameters.Add(new SqlParameter(name, developerIds[index]));
            }

            sql += $"""

                   AND DeveloperId IN ({string.Join(", ", placeholders)})
                """;
        }

        try
        {
            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = sql;
            command.Parameters.Add(new SqlParameter("@from", SqlDbType.Date) { Value = from });
            command.Parameters.Add(new SqlParameter("@to", SqlDbType.Date) { Value = to });
            command.Parameters.Add(new SqlParameter("@projectId", SqlDbType.UniqueIdentifier)
            {
                Value = projectId ?? (object)DBNull.Value,
            });

            foreach (var parameter in developerParameters)
            {
                command.Parameters.Add(parameter);
            }

            var rows = new List<WorkEntryRow>();

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);

            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new WorkEntryRow(
                    reader.GetGuid(0),
                    reader.GetGuid(1),
                    reader.GetGuid(2),
                    reader.IsDBNull(3) ? null : reader.GetGuid(3),
                    DateOnly.FromDateTime(reader.GetDateTime(4)),
                    reader.GetString(5),
                    reader.GetString(6),
                    reader.GetString(7),
                    reader.GetInt32(8),
                    reader.IsDBNull(9) ? null : reader.GetDecimal(9),
                    reader.IsDBNull(10) ? null : reader.GetDecimal(10),
                    reader.GetBoolean(11)));
            }

            return rows;
        }
        catch (SqlException ex) when (ex.Number == 208)
        {
            logger.LogWarning(
                ex,
                "Work schema tables are not available yet; returning an empty report slice.");

            return [];
        }
    }
}
