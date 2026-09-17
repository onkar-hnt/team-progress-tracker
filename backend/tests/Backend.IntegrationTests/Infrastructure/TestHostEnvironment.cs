using System.Runtime.CompilerServices;

namespace Backend.IntegrationTests.Infrastructure;

/// <summary>
/// Configuration the service hosts need while they are starting, before the
/// fixture can hand them anything.
///
/// <c>AddAppDefaults</c> refuses to build a host without a signing key, and it
/// reads one as it runs - so a value supplied through
/// <c>WebApplicationFactory.ConfigureAppConfiguration</c> arrives too late. A
/// developer machine gets away with it because an appsettings.Local.json is
/// sitting beside each project; a fresh clone and a CI runner do not, and used
/// to fail with a message about configuration that the person running the
/// tests could do nothing sensible about.
///
/// Set here rather than in the fixture because a module initializer runs
/// before any test, including the ones that build a host of their own.
/// </summary>
internal static class TestHostEnvironment
{
    [ModuleInitializer]
    internal static void Prepare()
    {
        SetIfAbsent("Jwt__SigningKey", TestConfiguration.JwtSigningKey);

        // Names the test database rather than relying on the in-memory value
        // the fixture adds later, so nothing a host reads while starting can
        // reach the database somebody is developing against.
        SetIfAbsent("ConnectionStrings__DefaultConnection", TestConfiguration.BuildConnectionString());

        SetIfAbsent("Seed__AdminEmail", TestConfiguration.AdminEmail);
        SetIfAbsent("Seed__AdminName", TestConfiguration.AdminDisplayName);
        SetIfAbsent("Seed__AdminPassword", TestConfiguration.AdminPassword);

        // The fixture migrates each context itself, in the order the schemas
        // depend on each other. A host doing it on startup as well would race.
        SetIfAbsent("Database__MigrateOnStartup", "false");
    }

    /// <summary>
    /// Leaves an existing value alone, so a run can be pointed somewhere else
    /// from outside without editing the tests.
    /// </summary>
    private static void SetIfAbsent(string name, string value)
    {
        if (Environment.GetEnvironmentVariable(name) is null or "")
        {
            Environment.SetEnvironmentVariable(name, value);
        }
    }
}
