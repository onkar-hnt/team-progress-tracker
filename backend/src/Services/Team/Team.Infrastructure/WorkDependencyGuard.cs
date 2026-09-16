using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

using SharedKernel;

namespace Team.Infrastructure;

/// <summary>
/// Refuses a roster soft-delete while live work rows still point at it. The
/// work tables live in another schema on the same database, so this reads them
/// with narrow SQL rather than taking a project reference on the Work service.
/// </summary>
public sealed class WorkDependencyGuard(TeamDbContext context, ILogger<WorkDependencyGuard> logger)
{
    public async Task EnsureDeveloperCanBeRemovedAsync(Guid developerId, CancellationToken cancellationToken)
    {
        if (await context.MentorAssignments.AnyAsync(
                row => row.DeveloperId == developerId,
                cancellationToken))
        {
            throw new ConflictException(
                "This employee still has mentor assignments. Remove those before deleting them.");
        }

        if (await context.ProjectDevelopers.AnyAsync(
                row => row.DeveloperId == developerId,
                cancellationToken))
        {
            throw new ConflictException(
                "This employee is still assigned to a project. Remove them from every project first.");
        }

        if (await HasLiveWorkRowAsync(
                $"""
                 SELECT CASE WHEN EXISTS (
                     SELECT 1 FROM [{Db.Work}].[{Db.DailyUpdates}]
                      WHERE DeveloperId = @id AND DeletedAt IS NULL
                 ) OR EXISTS (
                     SELECT 1 FROM [{Db.Work}].[{Db.Tasks}]
                      WHERE DeveloperId = @id AND DeletedAt IS NULL
                 ) OR EXISTS (
                     SELECT 1 FROM [{Db.Work}].[{Db.Feedback}]
                      WHERE DeveloperId = @id AND DeletedAt IS NULL
                 ) THEN 1 ELSE 0 END
                 """,
                developerId,
                cancellationToken))
        {
            throw new ConflictException(
                "Daily updates, tasks or feedback still reference this employee.");
        }
    }

    public async Task EnsureMentorCanBeRemovedAsync(Guid mentorId, CancellationToken cancellationToken)
    {
        if (await HasLiveWorkRowAsync(
                $"""
                 SELECT CASE WHEN EXISTS (
                     SELECT 1 FROM [{Db.Work}].[{Db.Feedback}]
                      WHERE MentorId = @id AND DeletedAt IS NULL
                 ) THEN 1 ELSE 0 END
                 """,
                mentorId,
                cancellationToken))
        {
            throw new ConflictException("Feedback still references this mentor.");
        }
    }

    public async Task EnsureProjectCanBeRemovedAsync(Guid projectId, CancellationToken cancellationToken)
    {
        if (await HasLiveWorkRowAsync(
                $"""
                 SELECT CASE WHEN EXISTS (
                     SELECT 1 FROM [{Db.Work}].[{Db.DailyUpdates}]
                      WHERE ProjectId = @id AND DeletedAt IS NULL
                 ) OR EXISTS (
                     SELECT 1 FROM [{Db.Work}].[{Db.Tasks}]
                      WHERE ProjectId = @id AND DeletedAt IS NULL
                 ) THEN 1 ELSE 0 END
                 """,
                projectId,
                cancellationToken))
        {
            throw new ConflictException(
                "Daily updates or tasks still reference this project.");
        }
    }

    private async Task<bool> HasLiveWorkRowAsync(
        string sql,
        Guid id,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var command = await CommandAsync(cancellationToken);
            command.CommandText = sql;
            command.Parameters.Add(new SqlParameter("@id", id));

            var result = await command.ExecuteScalarAsync(cancellationToken);

            return result is 1 or true;
        }
        catch (SqlException exception) when (exception.Number == 208)
        {
            logger.LogWarning(
                "Work schema tables are not present yet; skipping dependency check for {EntityId}",
                id);

            return false;
        }
    }

    private async Task<SqlCommand> CommandAsync(CancellationToken cancellationToken)
    {
        var connection = (SqlConnection)context.Database.GetDbConnection();

        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        return (SqlCommand)connection.CreateCommand();
    }
}
