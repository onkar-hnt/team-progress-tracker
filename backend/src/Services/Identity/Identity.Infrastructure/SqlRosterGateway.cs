using Contracts;

using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

using SharedKernel;

namespace Identity.Infrastructure;

/// <summary>
/// Reads the roster, and writes nothing on it but the identity link.
/// <para>
/// The services share one database with a schema each, so this is four
/// statements rather than four HTTP calls to the Team service. That is a
/// deliberate trade: provisioning is the one flow that needs both sides at
/// once, and every alternative either duplicates the roster or makes signing
/// in depend on a second service being up. The column list is narrow and the
/// names come from <see cref="Db"/>, so the coupling is visible and checked by
/// the compiler where it can be.
/// </para>
/// </summary>
public sealed class SqlRosterGateway(IdentityDbContext context) : IRosterGateway
{
    public async Task<RosterLinks> FindLinksAsync(
        Guid profileId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT
                (SELECT TOP 1 Id FROM [{Db.Team}].[{Db.Developers}]
                  WHERE ProfileId = @profileId AND DeletedAt IS NULL) AS DeveloperId,
                (SELECT TOP 1 Id FROM [{Db.Team}].[{Db.Mentors}]
                  WHERE ProfileId = @profileId AND DeletedAt IS NULL) AS MentorId
            """;

        await using var command = await CommandAsync(sql, cancellationToken);
        command.Parameters.Add(new SqlParameter("@profileId", profileId));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        if (!await reader.ReadAsync(cancellationToken))
        {
            return new RosterLinks(null, null);
        }

        return new RosterLinks(GuidOrNull(reader, 0), GuidOrNull(reader, 1));
    }

    public async Task<RosterMemberDto?> FindMemberAsync(
        string table,
        Guid rowId,
        CancellationToken cancellationToken = default)
    {
        var sql = table == "mentors"
            ? $"""
                SELECT m.Id, m.Name, m.Email, m.ProfileId, CAST(NULL AS nvarchar(20)) AS AccessRole,
                       CAST(1 AS bit) AS IsAlsoMentor
                FROM [{Db.Team}].[{Db.Mentors}] m
                WHERE m.Id = @rowId AND m.DeletedAt IS NULL
                """
            : $"""
                SELECT d.Id, d.Name, d.Email, d.ProfileId, d.AccessRole,
                       CAST(CASE WHEN EXISTS (
                           SELECT 1 FROM [{Db.Team}].[{Db.Mentors}] m
                           WHERE m.DeletedAt IS NULL
                             AND ((d.ProfileId IS NOT NULL AND m.ProfileId = d.ProfileId)
                               OR (d.Email IS NOT NULL AND m.Email = d.Email))
                       ) THEN 1 ELSE 0 END AS bit) AS IsAlsoMentor
                FROM [{Db.Team}].[{Db.Developers}] d
                WHERE d.Id = @rowId AND d.DeletedAt IS NULL
                """;

        await using var command = await CommandAsync(sql, cancellationToken);
        command.Parameters.Add(new SqlParameter("@rowId", rowId));

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        if (!await reader.ReadAsync(cancellationToken))
        {
            return null;
        }

        return new RosterMemberDto
        {
            Id = reader.GetGuid(0),
            Name = reader.GetString(1),
            Email = reader.IsDBNull(2) ? null : reader.GetString(2),
            ProfileId = GuidOrNull(reader, 3),
            AccessRole = reader.IsDBNull(4) ? null : reader.GetString(4),
            IsAlsoMentor = !reader.IsDBNull(5) && reader.GetBoolean(5),
        };
    }

    public async Task LinkProfileAsync(
        string table,
        Guid rowId,
        Guid profileId,
        CancellationToken cancellationToken = default)
    {
        var target = table == "mentors" ? Db.Mentors : Db.Developers;

        var sql = $"""
            UPDATE [{Db.Team}].[{target}]
               SET ProfileId = @profileId, UpdatedAt = SYSDATETIMEOFFSET()
             WHERE Id = @rowId AND DeletedAt IS NULL
            """;

        await using var command = await CommandAsync(sql, cancellationToken);
        command.Parameters.Add(new SqlParameter("@profileId", profileId));
        command.Parameters.Add(new SqlParameter("@rowId", rowId));

        var affected = await command.ExecuteNonQueryAsync(cancellationToken);

        if (affected == 0)
        {
            throw new NotFoundException("That person is no longer on the roster.");
        }
    }

    public async Task<bool> MentorSeesDeveloperAsync(
        Guid mentorId,
        Guid developerId,
        CancellationToken cancellationToken = default)
    {
        const string sql = $"""
            SELECT CAST(CASE WHEN EXISTS (
                SELECT 1 FROM [{Db.Team}].[{Db.MentorAssignments}]
                 WHERE MentorId = @mentorId AND DeveloperId = @developerId AND Active = 1
            ) THEN 1 ELSE 0 END AS bit)
            """;

        await using var command = await CommandAsync(sql, cancellationToken);
        command.Parameters.Add(new SqlParameter("@mentorId", mentorId));
        command.Parameters.Add(new SqlParameter("@developerId", developerId));

        var result = await command.ExecuteScalarAsync(cancellationToken);

        return result is true;
    }

    private async Task<SqlCommand> CommandAsync(string sql, CancellationToken cancellationToken)
    {
        var connection = (SqlConnection)context.Database.GetDbConnection();

        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        var command = connection.CreateCommand();
        command.CommandText = sql;

        return (SqlCommand)command;
    }

    private static Guid? GuidOrNull(SqlDataReader reader, int index) =>
        reader.IsDBNull(index) ? null : reader.GetGuid(index);
}
