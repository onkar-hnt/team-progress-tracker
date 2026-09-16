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
    public static async Task<string> EnsureReadyAsync(CancellationToken cancellationToken = default)
    {
        var databaseName = TestConfiguration.ResolveDatabaseName();
        var server = TestConfiguration.DefaultServer;

        try
        {
            await using var master = new SqlConnection(
                TestConfiguration.BuildConnectionString("master"));
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
        catch (SqlException exception)
        {
            throw new InvalidOperationException(
                $"Could not reach SQL Server instance '{server}' to create or open integration-test database '{databaseName}'. " +
                "Start SQL Server Express and ensure the instance name matches TestConfiguration.DefaultServer, " +
                $"or set {TestConfiguration.DatabaseEnvironmentVariable} to use another database name on that instance.",
                exception);
        }

        return TestConfiguration.BuildConnectionString(databaseName);
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
