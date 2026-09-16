using System.Data;

using Contracts;

using Microsoft.Data.SqlClient;

using SharedKernel;

namespace Work.Infrastructure;

public sealed class SqlTeamDirectory(WorkConnectionFactory connections) : ITeamDirectory
{
    public async Task<RosterDeveloper?> FindDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT Id, Name, ProfileId, Active, PrimaryProjectId
              FROM [{Db.Team}].[{Db.Developers}]
             WHERE Id = @id AND DeletedAt IS NULL
            """;

        await using var reader = await QueryAsync(sql, cancellationToken, ("@id", developerId));

        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new RosterDeveloper(
            reader.GetGuid(0),
            reader.GetString(1),
            reader.IsDBNull(2) ? null : reader.GetGuid(2),
            reader.GetBoolean(3),
            reader.IsDBNull(4) ? null : reader.GetGuid(4));
    }

    public async Task<bool> DeveloperExistsAsync(
        Guid developerId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1 FROM [{Db.Team}].[{Db.Developers}]
                 WHERE Id = @id AND DeletedAt IS NULL
            ) THEN 1 ELSE 0 END AS bit)
            """;

        return await ScalarBoolAsync(sql, cancellationToken, ("@id", developerId));
    }

    public async Task<bool> ProjectExistsAsync(
        Guid projectId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1 FROM [{Db.Team}].[{Db.Projects}]
                 WHERE Id = @id AND DeletedAt IS NULL
            ) THEN 1 ELSE 0 END AS bit)
            """;

        return await ScalarBoolAsync(sql, cancellationToken, ("@id", projectId));
    }

    public async Task<bool> MentorExistsAsync(
        Guid mentorId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1 FROM [{Db.Team}].[{Db.Mentors}]
                 WHERE Id = @id AND DeletedAt IS NULL
            ) THEN 1 ELSE 0 END AS bit)
            """;

        return await ScalarBoolAsync(sql, cancellationToken, ("@id", mentorId));
    }

    public async Task<IReadOnlyList<Guid>> GetAssignedDeveloperIdsAsync(
        Guid mentorId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT DeveloperId
              FROM [{Db.Team}].[{Db.MentorAssignments}]
             WHERE MentorId = @mentorId AND Active = 1
            """;

        await using var reader = await QueryAsync(sql, cancellationToken, ("@mentorId", mentorId));
        var ids = new List<Guid>();

        while (await reader.ReadAsync(cancellationToken))
        {
            ids.Add(reader.GetGuid(0));
        }

        return ids;
    }

    public async Task<IReadOnlyList<MentorContact>> GetActiveMentorsForDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT m.Id, m.Name, m.ProfileId
              FROM [{Db.Team}].[{Db.MentorAssignments}] a
              JOIN [{Db.Team}].[{Db.Mentors}] m ON m.Id = a.MentorId AND m.DeletedAt IS NULL AND m.Active = 1
             WHERE a.DeveloperId = @developerId AND a.Active = 1
            """;

        await using var reader = await QueryAsync(sql, cancellationToken, ("@developerId", developerId));
        var mentors = new List<MentorContact>();

        while (await reader.ReadAsync(cancellationToken))
        {
            mentors.Add(new MentorContact(
                reader.GetGuid(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetGuid(2)));
        }

        return mentors;
    }

    public async Task<Guid?> GetPrimaryMentorIdAsync(
        Guid developerId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT TOP 1 MentorId
              FROM [{Db.Team}].[{Db.MentorAssignments}]
             WHERE DeveloperId = @developerId AND Active = 1
             ORDER BY AssignedDate DESC, CreatedAt DESC
            """;

        var result = await ScalarAsync(sql, cancellationToken, ("@developerId", developerId));

        return result is Guid id ? id : null;
    }

    public async Task<IReadOnlyDictionary<Guid, string>> GetDeveloperNamesAsync(
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT Id, Name
              FROM [{Db.Team}].[{Db.Developers}]
             WHERE DeletedAt IS NULL
            """;

        return await ReadNameMapAsync(sql, cancellationToken);
    }

    public async Task<IReadOnlyDictionary<Guid, string>> GetProjectNamesAsync(
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT Id, Name
              FROM [{Db.Team}].[{Db.Projects}]
             WHERE DeletedAt IS NULL
            """;

        return await ReadNameMapAsync(sql, cancellationToken);
    }

    private async Task<IReadOnlyDictionary<Guid, string>> ReadNameMapAsync(
        string sql,
        CancellationToken cancellationToken)
    {
        await using var reader = await QueryAsync(sql, cancellationToken);
        var map = new Dictionary<Guid, string>();

        while (await reader.ReadAsync(cancellationToken))
        {
            map[reader.GetGuid(0)] = reader.GetString(1);
        }

        return map;
    }

    private async Task<SqlDataReader> QueryAsync(
        string sql,
        CancellationToken cancellationToken,
        params (string Name, object Value)[] parameters)
    {
        var connection = await connections.OpenAsync(cancellationToken);
        var command = connection.CreateCommand();
        command.CommandText = sql;

        foreach (var (name, value) in parameters)
        {
            command.Parameters.Add(new SqlParameter(name, value));
        }

        return await command.ExecuteReaderAsync(CommandBehavior.CloseConnection, cancellationToken);
    }

    private async Task<object?> ScalarAsync(
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

        return await command.ExecuteScalarAsync(cancellationToken);
    }

    private async Task<bool> ScalarBoolAsync(
        string sql,
        CancellationToken cancellationToken,
        params (string Name, object Value)[] parameters)
    {
        var result = await ScalarAsync(sql, cancellationToken, parameters);

        return result is true or 1;
    }
}
