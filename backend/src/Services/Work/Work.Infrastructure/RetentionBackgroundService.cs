using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

using SharedKernel;

namespace Work.Infrastructure;

/// <summary>
/// Replaces Postgres prune_record_history and purge_expired_deletions (R12).
/// </summary>
public sealed class RetentionBackgroundService(
    IServiceProvider services,
    IOptions<RetentionOptions> options,
    ILogger<RetentionBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunPassAsync(stoppingToken);
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Retention pass failed.");
            }

            await Task.Delay(TimeSpan.FromHours(options.Value.IntervalHours), stoppingToken);
        }
    }

    private async Task RunPassAsync(CancellationToken cancellationToken)
    {
        await using var scope = services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<WorkDbContext>();
        var connections = scope.ServiceProvider.GetRequiredService<WorkConnectionFactory>();
        var cutoff = DateTimeOffset.UtcNow.AddDays(-DomainRules.RetentionDays);

        await PurgeHistoryAsync(context, cutoff, cancellationToken);
        await PurgeSoftDeletedWorkAsync(context, cutoff, cancellationToken);
        await PurgeSoftDeletedTeamAsync(connections, cutoff, cancellationToken);
    }

    private async Task PurgeHistoryAsync(
        WorkDbContext context,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        while (true)
        {
            var batch = await context.RecordHistories
                .Where(row => row.ChangedAt < cutoff)
                .OrderBy(row => row.ChangedAt)
                .Take(options.Value.HistoryBatchSize)
                .ToListAsync(cancellationToken);

            if (batch.Count == 0)
            {
                return;
            }

            context.RecordHistories.RemoveRange(batch);
            await context.SaveChangesAsync(cancellationToken);
        }
    }

    private async Task PurgeSoftDeletedWorkAsync(
        WorkDbContext context,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        await HardDeleteBatchAsync(
            context.Feedback.Where(row => row.DeletedAt != null && row.DeletedAt < cutoff),
            "feedback",
            cancellationToken);

        await HardDeleteBatchAsync(
            context.DailyUpdates.Where(row => row.DeletedAt != null && row.DeletedAt < cutoff),
            "daily updates",
            cancellationToken);

        await HardDeleteBatchAsync(
            context.Tasks.Where(row => row.DeletedAt != null && row.DeletedAt < cutoff),
            "tasks",
            cancellationToken);
    }

    private async Task HardDeleteBatchAsync<T>(
        IQueryable<T> query,
        string label,
        CancellationToken cancellationToken) where T : class
    {
        while (true)
        {
            var ids = await query.Select(row => EF.Property<Guid>(row, "Id"))
                .Take(options.Value.DeletionBatchSize)
                .ToListAsync(cancellationToken);

            if (ids.Count == 0)
            {
                return;
            }

            foreach (var id in ids)
            {
                try
                {
                    await query.Where(row => EF.Property<Guid>(row, "Id") == id)
                        .ExecuteDeleteAsync(cancellationToken);
                }
                catch (Exception exception) when (IsForeignKeyViolation(exception))
                {
                    logger.LogWarning(
                        exception,
                        "Skipped purging {Label} row {RowId} because something still references it.",
                        label,
                        id);
                }
            }
        }
    }

    private static bool IsForeignKeyViolation(Exception exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is SqlException sql && sql.Number == 547)
            {
                return true;
            }
        }

        return false;
    }

    private async Task PurgeSoftDeletedTeamAsync(
        WorkConnectionFactory connections,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        await PurgeTeamTableAsync(connections, Db.Projects, cutoff, cancellationToken);
        await PurgeTeamTableAsync(connections, Db.Mentors, cutoff, cancellationToken);
        await PurgeTeamTableAsync(connections, Db.Developers, cutoff, cancellationToken);
    }

    private async Task PurgeTeamTableAsync(
        WorkConnectionFactory connections,
        string table,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        while (true)
        {
            var sql = $"""
                SELECT TOP ({options.Value.DeletionBatchSize}) Id
                  FROM [{Db.Team}].[{table}]
                 WHERE DeletedAt IS NOT NULL AND DeletedAt < @cutoff
                """;

            List<Guid> ids;

            try
            {
                ids = await ReadIdsAsync(connections, sql, cutoff, cancellationToken);
            }
            catch (SqlException exception) when (exception.Number == 208)
            {
                logger.LogWarning(exception, "Team table {TableName} missing during retention purge.", table);
                return;
            }

            if (ids.Count == 0)
            {
                return;
            }

            foreach (var id in ids)
            {
                var deleteSql = $"""
                    DELETE FROM [{Db.Team}].[{table}]
                     WHERE Id = @id AND DeletedAt IS NOT NULL
                    """;

                try
                {
                    await ExecuteAsync(connections, deleteSql, cancellationToken, ("@id", id));
                }
                catch (SqlException exception) when (exception.Number is 547)
                {
                    logger.LogWarning(
                        exception,
                        "Skipped purging team.{TableName} row {RowId} because something still references it.",
                        table,
                        id);
                }
            }
        }
    }

    private static async Task<List<Guid>> ReadIdsAsync(
        WorkConnectionFactory connections,
        string sql,
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.Add(new SqlParameter("@cutoff", cutoff));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var ids = new List<Guid>();

        while (await reader.ReadAsync(cancellationToken))
        {
            ids.Add(reader.GetGuid(0));
        }

        return ids;
    }

    private static async Task ExecuteAsync(
        WorkConnectionFactory connections,
        string sql,
        CancellationToken cancellationToken,
        params (string Name, object Value)[] parameters)
    {
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;

        foreach (var (name, value) in parameters)
        {
            command.Parameters.Add(new SqlParameter(name, value));
        }

        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
