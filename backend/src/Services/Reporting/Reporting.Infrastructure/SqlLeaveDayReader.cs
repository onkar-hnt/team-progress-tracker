using System.Data;

using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

using Reporting.Application;

using SharedKernel;

namespace Reporting.Infrastructure;

/// <summary>
/// Reads the leave days the Team service owns. Same cross-schema trade as
/// <see cref="SqlTeamDirectory"/>: one database, narrow SQL, names from
/// <see cref="Db"/>, and nothing written.
/// </summary>
public sealed class SqlLeaveDayReader(
    ReportingConnectionFactory connections,
    ILogger<SqlLeaveDayReader> logger) : ILeaveDayReader
{
    public async Task<IReadOnlyList<LeaveDayRow>> ListAsync(
        DateOnly from,
        DateOnly to,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken = default)
    {
        if (developerIds is { Count: 0 })
        {
            return [];
        }

        var sql = $"""
            SELECT DeveloperId, LeaveDate, Note
              FROM [{Db.Team}].[{Db.LeaveDays}]
             WHERE LeaveDate >= @from AND LeaveDate <= @to
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

            foreach (var parameter in developerParameters)
            {
                command.Parameters.Add(parameter);
            }

            var rows = new List<LeaveDayRow>();

            await using var reader = await command.ExecuteReaderAsync(cancellationToken);

            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new LeaveDayRow(
                    reader.GetGuid(0),
                    DateOnly.FromDateTime(reader.GetDateTime(1)),
                    reader.IsDBNull(2) ? null : reader.GetString(2)));
            }

            return rows;
        }
        catch (SqlException exception) when (exception.Number == 208)
        {
            // The deploy carrying this code can land before the migration
            // carrying the table, and coverage is not the place to find that
            // out: unavailable means "no leave recorded", which is what every
            // day before this feature already meant.
            logger.LogWarning(
                exception,
                "team.LeaveDays is not available yet; treating the range as having no leave.");

            return [];
        }
    }
}
