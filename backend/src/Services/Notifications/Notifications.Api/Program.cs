using Common;

using Microsoft.EntityFrameworkCore;

using Notifications.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.AddAppDefaults(
    "Notifications",
    """
    Each person's own inbox, and the types they have muted. Notifications are
    raised by the services that cause them; this one stores, filters and serves
    them. Nobody can read or change anybody else's.
    """);
builder.Services.AddNotificationServices(builder.Configuration);

builder.Services
    .AddControllers(options => options.Filters.Add<ValidationFilter>())
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy =
            System.Text.Json.JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.AddUpdatePayloadSupport();
    });

var app = builder.Build();

app.UseAppDefaults();
app.MapControllers();

if (app.Configuration.GetValue("Database:MigrateOnStartup", false))
{
    await using var scope = app.Services.CreateAsyncScope();

    await scope.ServiceProvider.GetRequiredService<NotificationsDbContext>().Database.MigrateAsync();
}

app.Run();
