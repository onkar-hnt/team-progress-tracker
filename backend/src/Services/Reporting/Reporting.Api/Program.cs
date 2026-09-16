using Common;

using Reporting.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.AddAppDefaults(
    "Reporting",
    """
    Read-only totals over a date range, by employee and by project, filtered to
    what the caller is allowed to see. Aggregated in the database; this service
    writes nothing.
    """);
builder.Services.AddReportingServices(builder.Configuration);

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

app.Run();
