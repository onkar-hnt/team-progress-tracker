using Contracts;

using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

using SharedKernel;

using Work.Application;

namespace Work.Infrastructure;

public sealed class SqlRecycleBinGateway(
    WorkConnectionFactory connections,
    ILogger<SqlRecycleBinGateway> logger) : IRecycleBinGateway
{
    public async Task<IReadOnlyList<DeletedRecordDto>> ListTeamDeletedAsync(
        CancellationToken cancellationToken)
    {
        var results = new List<DeletedRecordDto>();

        results.AddRange(await ReadDevelopersAsync(cancellationToken));
        results.AddRange(await ReadMentorsAsync(cancellationToken));
        results.AddRange(await ReadProjectsAsync(cancellationToken));

        return results;
    }

    public async Task RestoreTeamRowAsync(string kind, Guid id, CancellationToken cancellationToken)
    {
        var (schema, table) = TeamTable(kind);

        var sql = $"""
            UPDATE [{Db.Team}].[{table}]
               SET DeletedAt = NULL, DeletedBy = NULL, UpdatedAt = SYSDATETIMEOFFSET()
             WHERE Id = @id AND DeletedAt IS NOT NULL
            """;

        await ExecuteAsync(sql, cancellationToken, ("@id", id));
    }

    public async Task DestroyTeamRowAsync(string kind, Guid id, CancellationToken cancellationToken)
    {
        var (_, table) = TeamTable(kind);

        var sql = $"""
            DELETE FROM [{Db.Team}].[{table}]
             WHERE Id = @id AND DeletedAt IS NOT NULL
            """;

        await ExecuteAsync(sql, cancellationToken, ("@id", id));
    }

    private async Task<IReadOnlyList<DeletedRecordDto>> ReadDevelopersAsync(
        CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT Id, Name, DeletedAt, DeletedBy
              FROM [{Db.Team}].[{Db.Developers}]
             WHERE DeletedAt IS NOT NULL
            """;

        return await ReadRowsAsync(sql, "employee", null, null, cancellationToken);
    }

    private async Task<IReadOnlyList<DeletedRecordDto>> ReadMentorsAsync(
        CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT Id, Name, DeletedAt, DeletedBy
              FROM [{Db.Team}].[{Db.Mentors}]
             WHERE DeletedAt IS NOT NULL
            """;

        return await ReadRowsAsync(sql, "mentor", null, null, cancellationToken);
    }

    private async Task<IReadOnlyList<DeletedRecordDto>> ReadProjectsAsync(
        CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT Id, Name, DeletedAt, DeletedBy
              FROM [{Db.Team}].[{Db.Projects}]
             WHERE DeletedAt IS NOT NULL
            """;

        return await ReadRowsAsync(sql, "project", null, null, cancellationToken);
    }

    private async Task<IReadOnlyList<DeletedRecordDto>> ReadRowsAsync(
        string sql,
        string kind,
        Guid? developerId,
        Guid? projectId,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = sql;
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);

            var rows = new List<DeletedRecordDto>();

            while (await reader.ReadAsync(cancellationToken))
            {
                rows.Add(new DeletedRecordDto
                {
                    Kind = kind,
                    Id = reader.GetGuid(0),
                    Title = reader.GetString(1),
                    DeletedAt = DateStrings.From(reader.GetFieldValue<DateTimeOffset>(2)),
                    DeletedBy = reader.IsDBNull(3) ? null : reader.GetGuid(3),
                    DeveloperId = developerId,
                    ProjectId = projectId,
                });
            }

            return rows;
        }
        catch (SqlException exception) when (exception.Number == 208)
        {
            logger.LogWarning(exception, "Team roster table missing while listing Recently deleted.");
            return [];
        }
    }

    private async Task ExecuteAsync(
        string sql,
        CancellationToken cancellationToken,
        params (string Name, object Value)[] parameters)
    {
        try
        {
            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = sql;

            foreach (var (name, value) in parameters)
            {
                command.Parameters.Add(new SqlParameter(name, value));
            }

            var affected = await command.ExecuteNonQueryAsync(cancellationToken);

            if (affected == 0)
            {
                throw new NotFoundException("That item is not in Recently deleted.");
            }
        }
        catch (SqlException exception) when (exception.Number == 208)
        {
            logger.LogWarning(exception, "Team roster table missing while restoring or destroying.");
            throw new NotFoundException("That item is not in Recently deleted.");
        }
    }

    private static (string Schema, string Table) TeamTable(string kind) => kind switch
    {
        "employee" => (Db.Team, Db.Developers),
        "mentor" => (Db.Team, Db.Mentors),
        "project" => (Db.Team, Db.Projects),
        _ => throw new ValidationFailedException("That record kind is not recognised."),
    };
}
