using Identity.Api.Controllers;

using Notifications.Api.Controllers;

using Reporting.Api.Controllers;

using Team.Api.Controllers;

using Work.Api.Controllers;

namespace Backend.IntegrationTests.Infrastructure;

public sealed class IntegrationTestEnvironment : IAsyncLifetime
{
    public string ConnectionString { get; private set; } = string.Empty;

    public ServiceWebApplicationFactory<AuthController> Identity { get; private set; } = null!;

    public ServiceWebApplicationFactory<DevelopersController> Team { get; private set; } = null!;

    public ServiceWebApplicationFactory<TasksController> Work { get; private set; } = null!;

    public ServiceWebApplicationFactory<NotificationsController> Notifications { get; private set; } = null!;

    public ServiceWebApplicationFactory<ReportsController> Reporting { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        ConnectionString = await TestDatabaseBootstrap.EnsureReadyAsync();

        Identity = new ServiceWebApplicationFactory<AuthController>(ConnectionString);
        Team = new ServiceWebApplicationFactory<DevelopersController>(ConnectionString);
        Work = new ServiceWebApplicationFactory<TasksController>(ConnectionString);
        Notifications = new ServiceWebApplicationFactory<NotificationsController>(ConnectionString);
        Reporting = new ServiceWebApplicationFactory<ReportsController>(ConnectionString);

        await TestDatabaseBootstrap.MigrateIdentityAsync(Identity.Services);
        await TestDatabaseBootstrap.MigrateTeamAsync(Team.Services);
        await TestDatabaseBootstrap.MigrateWorkAsync(Work.Services);
        await TestDatabaseBootstrap.MigrateNotificationsAsync(Notifications.Services);
    }

    public Task DisposeAsync()
    {
        Identity.Dispose();
        Team.Dispose();
        Work.Dispose();
        Notifications.Dispose();
        Reporting.Dispose();

        return Task.CompletedTask;
    }

    public HttpClient IdentityClient() => Identity.CreateClient();

    public HttpClient TeamClient() => Team.CreateClient();

    public HttpClient WorkClient() => Work.CreateClient();

    public HttpClient NotificationsClient() => Notifications.CreateClient();

    public HttpClient ReportingClient() => Reporting.CreateClient();
}

[CollectionDefinition(IntegrationCollection.Name)]
public sealed class IntegrationCollection : ICollectionFixture<IntegrationTestEnvironment>
{
    public const string Name = "Backend integration tests";
}
