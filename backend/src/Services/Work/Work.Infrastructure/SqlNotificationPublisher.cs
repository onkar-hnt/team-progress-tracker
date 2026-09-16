using Contracts;

using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Logging;

using SharedKernel;

namespace Work.Infrastructure;

/// <summary>
/// Writes notification rows directly into notify.Notifications. Skips the actor
/// and muted types before insert — rules that Postgres applied in the notify layer.
/// </summary>
public sealed class SqlNotificationPublisher(
    WorkConnectionFactory connections,
    ILogger<SqlNotificationPublisher> logger) : INotificationPublisher
{
    public async Task PublishAsync(
        IReadOnlyCollection<NotificationRequest> requests,
        CancellationToken cancellationToken = default)
    {
        if (requests.Count == 0)
        {
            return;
        }

        foreach (var request in requests)
        {
            if (request.RecipientProfileId == Guid.Empty)
            {
                continue;
            }

            if (request.ActorProfileId is Guid actor && actor == request.RecipientProfileId)
            {
                continue;
            }

            try
            {
                if (await IsMutedAsync(request.RecipientProfileId, request.Type, cancellationToken))
                {
                    continue;
                }

                await InsertAsync(request, cancellationToken);
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "Could not enqueue notification type {NotificationType} for recipient {RecipientProfileId}",
                    request.Type,
                    request.RecipientProfileId);
            }
        }
    }

    private async Task<bool> IsMutedAsync(
        Guid profileId,
        string type,
        CancellationToken cancellationToken)
    {
        const string sql = $"""
            SELECT MutedNotificationTypes
              FROM [{Db.Notify}].[{Db.UserPreferences}]
             WHERE ProfileId = @profileId
            """;

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.Add(new SqlParameter("@profileId", profileId));

        var raw = await command.ExecuteScalarAsync(cancellationToken) as string;

        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var muted = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return muted.Contains(type, StringComparer.Ordinal);
    }

    private async Task InsertAsync(NotificationRequest request, CancellationToken cancellationToken)
    {
        const string sql = $"""
            INSERT INTO [{Db.Notify}].[{Db.Notifications}]
                (Id, RecipientProfileId, Type, Title, Message, EntityType, EntityId, IsRead, CreatedAt, UpdatedAt)
            VALUES
                (@id, @recipient, @type, @title, @message, @entityType, @entityId, 0, @now, @now)
            """;

        var now = DateTimeOffset.UtcNow;

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.Add(new SqlParameter("@id", Guid.CreateVersion7()));
        command.Parameters.Add(new SqlParameter("@recipient", request.RecipientProfileId));
        command.Parameters.Add(new SqlParameter("@type", request.Type));
        command.Parameters.Add(new SqlParameter("@title", request.Title));
        command.Parameters.Add(new SqlParameter("@message", request.Message));
        command.Parameters.Add(new SqlParameter("@entityType", (object?)request.EntityType ?? DBNull.Value));
        command.Parameters.Add(new SqlParameter("@entityId", (object?)request.EntityId ?? DBNull.Value));
        command.Parameters.Add(new SqlParameter("@now", now));

        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
