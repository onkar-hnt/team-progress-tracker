using Common;

using Microsoft.EntityFrameworkCore;

using Team.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.AddAppDefaults(
    "Team",
    """
    Who is on the team and what they are working on: employees, mentors, the
    assignments between them, and projects with their membership. Deleting
    anything here moves it to Recently deleted rather than destroying it, and
    is refused while live work still points at it.
    """);
builder.Services.AddTeamServices(builder.Configuration);
builder.Services.AddScoped<TeamSeeder>();

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

    await scope.ServiceProvider.GetRequiredService<TeamDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<TeamSeeder>().SeedAsync();
}

app.Run();
