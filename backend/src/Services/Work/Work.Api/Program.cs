using Common;

using Microsoft.EntityFrameworkCore;

using Work.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.AddAppDefaults(
    "Work",
    """
    The work itself: tasks, the daily updates underneath them, and the comment
    trail on each one. Also serves Activity and Recently deleted, since both
    are views over the same records. Task and update statuses are kept in step
    with each other, and deletions are reversible for fifteen days.
    """);
builder.Services.AddWorkServices(builder.Configuration);
builder.Services.AddScoped<WorkSeeder>();

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

    await scope.ServiceProvider.GetRequiredService<WorkDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<WorkSeeder>().SeedAsync();
}

app.Run();
