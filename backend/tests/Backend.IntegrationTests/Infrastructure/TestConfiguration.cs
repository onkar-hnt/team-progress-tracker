using Microsoft.Data.SqlClient;

namespace Backend.IntegrationTests.Infrastructure;

/// <summary>
/// Where the integration tests find a database, and the fixed identity they
/// sign in with.
///
/// The tests never share the application's database. They own
/// <see cref="DefaultDatabaseName"/>, create it if it is absent, and refuse to
/// run against <see cref="ApplicationDatabaseName"/> whatever the environment
/// says - a run that wrote its roster into the database somebody is developing
/// against would leave rows behind that look like real ones.
/// </summary>
public static class TestConfiguration
{
    /// <summary>
    /// A whole connection string, for a server the default does not describe:
    /// continuous integration, or a named instance on another machine.
    /// </summary>
    public const string ConnectionEnvironmentVariable = "INTEGRATION_TEST_CONNECTION";

    /// <summary>Only the database name, keeping the rest of the connection.</summary>
    public const string DatabaseEnvironmentVariable = "INTEGRATION_TEST_DATABASE";

    public const string DefaultServer = @"localhost\SQLEXPRESS01";

    public const string DefaultDatabaseName = "TeamProgressTracker_IntegrationTests";

    /// <summary>The database the application runs on, which tests must not touch.</summary>
    public const string ApplicationDatabaseName = "TeamProgressTracker";

    public const string JwtSigningKey = "integration-tests-signing-key-32-chars-min";

    public const string AdminEmail = "integration-admin@test.local";

    public const string AdminPassword = "IntegrationAdmin1!";

    public const string AdminDisplayName = "Integration Administrator";

    private static string BaseConnectionString() =>
        Environment.GetEnvironmentVariable(ConnectionEnvironmentVariable)?.Trim() is { Length: > 0 } supplied
            ? supplied
            : $"Server={DefaultServer};Database={DefaultDatabaseName};Trusted_Connection=True;" +
              "TrustServerCertificate=True;MultipleActiveResultSets=True";

    public static string ResolveDatabaseName()
    {
        if (Environment.GetEnvironmentVariable(DatabaseEnvironmentVariable)?.Trim() is { Length: > 0 } name)
        {
            return name;
        }

        var catalog = new SqlConnectionStringBuilder(BaseConnectionString()).InitialCatalog;
        return catalog.Length == 0 ? DefaultDatabaseName : catalog;
    }

    /// <summary>The server as the connection names it, for error messages.</summary>
    public static string ResolveServerName() =>
        new SqlConnectionStringBuilder(BaseConnectionString()).DataSource;

    public static string BuildConnectionString(string? databaseName = null)
    {
        var database = databaseName ?? ResolveDatabaseName();

        if (string.Equals(database, ApplicationDatabaseName, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"The integration tests were pointed at '{ApplicationDatabaseName}', which is the " +
                $"application's own database. Use {DatabaseEnvironmentVariable} or " +
                $"{ConnectionEnvironmentVariable} to name a different one, such as " +
                $"'{DefaultDatabaseName}'.");
        }

        return new SqlConnectionStringBuilder(BaseConnectionString())
        {
            InitialCatalog = database,
        }.ConnectionString;
    }
}
