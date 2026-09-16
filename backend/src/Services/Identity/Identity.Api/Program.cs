using Common;

using Identity.Infrastructure;

using Microsoft.EntityFrameworkCore;

using SharedKernel;

var builder = WebApplication.CreateBuilder(args);

builder.AddAppDefaults(
    "Identity",
    """
    Signing in, and the logins that let people do it. This service issues the
    token every other service trusts, decides who may reset whose password,
    and links a login to the employee or mentor it belongs to.
    """);
builder.Services.Configure<ProfileActiveGateOptions>(
    builder.Configuration.GetSection(ProfileActiveGateOptions.Section));
builder.Services.AddIdentityServices(builder.Configuration);
builder.Services.AddScoped<IdentitySeeder>();

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

    await scope.ServiceProvider.GetRequiredService<IdentityDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<IdentitySeeder>().SeedAsync();
}

app.Run();
