namespace Backend.IntegrationTests.Infrastructure;

public static class TestConfiguration
{
    public const string DatabaseEnvironmentVariable = "INTEGRATION_TEST_DATABASE";

    public const string DefaultServer = @"localhost\SQLEXPRESS01";

    public const string DefaultDatabaseName = "TeamProgressTracker_IntegrationTests";

    public const string JwtSigningKey = "integration-tests-signing-key-32-chars-min";

    public const string AdminEmail = "integration-admin@test.local";

    public const string AdminPassword = "IntegrationAdmin1!";

    public const string AdminDisplayName = "Integration Administrator";

    public static string ResolveDatabaseName() =>
        Environment.GetEnvironmentVariable(DatabaseEnvironmentVariable)?.Trim()
        is { Length: > 0 } name
            ? name
            : DefaultDatabaseName;

    public static string BuildConnectionString(string? databaseName = null)
    {
        var database = databaseName ?? ResolveDatabaseName();

        return
            $"Server={DefaultServer};Database={database};Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True";
    }
}
