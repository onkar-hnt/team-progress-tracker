using ApiGateway;

using Common;

using Contracts;

using Serilog;

using SharedKernel;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

var origins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddMemoryCache();
builder.Services.Configure<ProfileActiveGateOptions>(
    builder.Configuration.GetSection(ProfileActiveGateOptions.Section));
builder.Services.AddSingleton<GatewayConnectionFactory>();
builder.Services.AddSingleton<SqlProfileStatusReader>();
builder.Services.AddGatewayJwtValidation(builder.Configuration);

builder.Services.AddCors(options => options.AddPolicy(ServiceDefaults.CorsPolicy, policy =>
    policy.WithOrigins(origins)
        .WithHeaders("Authorization", "Content-Type")
        .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")));

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

builder.Host.UseSerilog((context, configuration) => configuration
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext());

var app = builder.Build();

// Kept in step with the clusters in appsettings.json.
(string Name, string Title)[] services =
[
    ("identity", "Identity — sign in, logins, passwords"),
    ("team", "Team — employees, mentors, projects"),
    ("work", "Work — tasks, daily updates, feedback"),
    ("notifications", "Notifications — inbox and preferences"),
    ("reporting", "Reporting — totals and filters"),
];

app.UseEnvelopeStatusCodes();
app.UseSerilogRequestLogging();
app.UseCors(ServiceDefaults.CorsPolicy);
app.UseAuthentication();
app.UseMiddleware<ProfileActiveGateMiddleware>();

// The gateway has no endpoints of its own to document, so it serves the UI and
// proxies each service's document into it. Because the documents describe paths
// without a host, Try-it-out from here goes back through the gateway, which is
// how the frontend talks to the backend as well.
app.UseSwaggerUI(options =>
{
    options.DocumentTitle = "Team Progress Tracker API";
    options.DisplayRequestDuration();
    options.EnableTryItOutByDefault();

    foreach (var (name, title) in services)
    {
        options.SwaggerEndpoint($"/swagger/{name}/swagger.json", title);
    }
});

app.MapGet("/health", () => Results.Ok(ApiResponse.Ok("Healthy.")));

app.MapGet("/", () => Results.Ok(ApiResponse<object>.Ok(
    new
    {
        swagger = "/swagger",
        services = services.Select(service => new
        {
            service.Name,
            document = $"/swagger/{service.Name}/swagger.json",
        }),
    },
    "Team Progress Tracker API gateway. Every service is reached through this origin.")));

app.MapReverseProxy();

app.Run();
