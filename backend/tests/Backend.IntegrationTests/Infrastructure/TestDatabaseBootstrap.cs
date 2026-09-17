using Identity.Application;
using Identity.Infrastructure;

using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Notifications.Infrastructure;

using SharedKernel;

using Team.Infrastructure;

using Work.Infrastructure;

namespace Backend.IntegrationTests.Infrastructure;

public static class TestDatabaseBootstrap
{
    /// <summary>How long to keep trying a server that is not answering yet.</summary>
    private static readonly TimeSpan ConnectTimeout = TimeSpan.FromSeconds(90);

    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(3);

    public static async Task<string> EnsureReadyAsync(CancellationToken cancellationToken = default)
    {
        var databaseName = TestConfiguration.ResolveDatabaseName();
        var server = TestConfiguration.ResolveServerName();

        // A container that has been asked to start is not a server that can be
        // signed in to, and the gap is tens of seconds. Retrying here means the
        // first test does not fail for a reason that fixes itself.
        var deadline = DateTime.UtcNow + ConnectTimeout;

        while (true)
        {
            try
            {
                await CreateDatabaseAsync(databaseName, cancellationToken);
                break;
            }
            catch (SqlException) when (DateTime.UtcNow < deadline)
            {
                await Task.Delay(RetryDelay, cancellationToken);
            }
            catch (SqlException exception)
            {
                throw new InvalidOperationException(
                    $"Could not reach SQL Server instance '{server}' to create or open integration-test database '{databaseName}'. " +
                    "Start SQL Server Express and ensure the instance name matches TestConfiguration.DefaultServer, " +
                    $"set {TestConfiguration.DatabaseEnvironmentVariable} to use another database name on that instance, " +
                    $"or set {TestConfiguration.ConnectionEnvironmentVariable} to a whole connection string for another server.",
                    exception);
            }
        }

        return TestConfiguration.BuildConnectionString(databaseName);
    }

    private static async Task CreateDatabaseAsync(string databaseName, CancellationToken cancellationToken)
    {
        await using var master = new SqlConnection(TestConfiguration.BuildConnectionString("master"));
        await master.OpenAsync(cancellationToken);

        var escapedName = databaseName.Replace("]", "]]");
        await using var create = master.CreateCommand();
        create.CommandText = $"""
            IF DB_ID(N'{databaseName.Replace("'", "''")}') IS NULL
            BEGIN
                CREATE DATABASE [{escapedName}];
            END
            """;
        await create.ExecuteNonQueryAsync(cancellationToken);
    }

    public static async Task MigrateIdentityAsync(
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        await context.Database.MigrateAsync(cancellationToken);
        await scope.ServiceProvider.GetRequiredService<IdentitySeeder>().SeedAsync(cancellationToken);
        await AlignAdministratorLoginAsync(scope.ServiceProvider, cancellationToken);
    }

    private static async Task AlignAdministratorLoginAsync(
        IServiceProvider services,
        CancellationToken cancellationToken)
    {
        await using var scope = services.CreateAsyncScope();
        var context = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        var administrator = await context.Profiles
            .OrderBy(profile => profile.CreatedAt)
            .FirstOrDefaultAsync(
                profile => profile.Email == TestConfiguration.AdminEmail || profile.Role == DomainRules.RoleAdmin,
                cancellationToken);

        if (administrator is null)
        {
            throw new InvalidOperationException(
                $"No administrator profile exists in '{TestConfiguration.ResolveDatabaseName()}' after seeding.");
        }

        administrator.Email = TestConfiguration.AdminEmail;
        administrator.DisplayName = TestConfiguration.AdminDisplayName;
        administrator.Role = DomainRules.RoleAdmin;
        administrator.Status = DomainRules.ProfileActive;
        administrator.MustChangePassword = false;
        administrator.PasswordHash = hasher.Hash(TestConfiguration.AdminPassword);

        await context.SaveChangesAsync(cancellationToken);
    }

    public static async Task MigrateTeamAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<TeamDbContext>().Database.MigrateAsync(cancellationToken);
    }

    public static async Task MigrateWorkAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<WorkDbContext>().Database.MigrateAsync(cancellationToken);
    }

    public static async Task MigrateNotificationsAsync(
        IServiceProvider services,
        CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<NotificationsDbContext>()
            .Database.MigrateAsync(cancellationToken);
    }
}
