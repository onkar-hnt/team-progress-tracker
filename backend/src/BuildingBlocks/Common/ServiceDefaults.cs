using System.Reflection;
using System.Text;
using System.Text.Json;

using Contracts;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

using Serilog;

using SharedKernel;

namespace Common;

/// <summary>
/// Everything each API host sets up identically: configuration sources, token
/// validation, the response envelope on every path out, Swagger with a bearer
/// field, CORS for the known frontends and structured logging. Five copies of
/// this would be five chances to differ.
/// </summary>
public static class ServiceDefaults
{
    public const string CorsPolicy = "frontend";

    public static IHostApplicationBuilder AddAppDefaults(
        this IHostApplicationBuilder builder,
        string serviceTitle,
        string? description = null)
    {
        // Signing keys, connection passwords and the seeded password live here
        // or in environment variables, never in a committed appsettings file.
        builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUser, CurrentUserAccessor>();

        builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.Section));

        var jwt = builder.Configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();

        if (string.IsNullOrWhiteSpace(jwt.SigningKey))
        {
            throw new InvalidOperationException(
                "Jwt:SigningKey is not configured. Copy backend/appsettings.Local.example.json to " +
                "appsettings.Local.json beside this project, or set the Jwt__SigningKey " +
                "environment variable.");
        }

        builder.Services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = jwt.Issuer,
                    ValidAudience = jwt.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
            });

        builder.Services.AddAuthorization(options =>
        {
            options.AddPolicy(AppPolicies.Admin, policy =>
                policy.RequireRole(DomainRules.RoleAdmin));

            options.AddPolicy(AppPolicies.Privileged, policy =>
                policy.RequireRole(DomainRules.RoleAdmin, DomainRules.RoleMentor));
        });

        var origins = builder.Configuration
            .GetSection("Cors:AllowedOrigins")
            .Get<string[]>() ?? [];

        builder.Services.AddCors(options => options.AddPolicy(CorsPolicy, policy =>
        {
            // Named origins only. The browser sends a bearer token, not a
            // cookie, so credentials are not enabled and need not be.
            policy.WithOrigins(origins)
                .WithHeaders("Authorization", "Content-Type")
                .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");
        }));

        // A binding or attribute failure would otherwise answer with
        // ProblemDetails, which is a different shape from everything else.
        builder.Services.Configure<ApiBehaviorOptions>(options =>
            options.InvalidModelStateResponseFactory = context =>
            {
                var errors = context.ModelState
                    .SelectMany(entry => entry.Value?.Errors ?? [])
                    .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                        ? "That value could not be read."
                        : error.ErrorMessage)
                    .ToList();

                return new BadRequestObjectResult(ApiResponse.Failure(
                    StatusCodes.Status400BadRequest,
                    "Some details need correcting before this can be saved.",
                    errors));
            });

        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen(options => ConfigureSwagger(options, serviceTitle, description));

        builder.Services.AddSerilog(configuration => configuration
            .ReadFrom.Configuration(builder.Configuration)
            .Enrich.FromLogContext());

        return builder;
    }

    private static void ConfigureSwagger(
        Swashbuckle.AspNetCore.SwaggerGen.SwaggerGenOptions options,
        string serviceTitle,
        string? description)
    {
        options.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = $"Team Progress Tracker — {serviceTitle}",
            Version = "v1",
            Description = $$"""
                {{description ?? serviceTitle}}

                **Every response has the same three properties**: `message`, `status` and `data`.
                `status` always equals the HTTP status code. On a failure, `data` is either null or
                `{ "errors": ["..."] }` listing everything that needs correcting.

                **Authentication.** Call `POST /api/auth/login` on the Identity service, copy the
                `data.accessToken` from the response, press **Authorize** above and paste it. One
                token is accepted by every service.

                **Roles.** `admin` sees everything; `mentor` sees the employees assigned to them;
                `developer` sees their own work. An endpoint marked 403 refuses a role that is
                signed in but not permitted.
                """,
            Contact = new OpenApiContact { Name = "Team Progress Tracker" },
        });

        options.SupportNonNullableReferenceTypes();
        options.UseAllOfToExtendReferenceSchemas();

        // Turns the <summary> on a controller action into its Swagger
        // description, and the ones on the DTOs into field descriptions.
        foreach (var assembly in new[] { Assembly.GetEntryAssembly(), typeof(ApiResponse).Assembly })
        {
            var documentation = Path.Combine(
                AppContext.BaseDirectory,
                $"{assembly?.GetName().Name}.xml");

            if (File.Exists(documentation))
            {
                options.IncludeXmlComments(documentation, includeControllerXmlComments: true);
            }
        }

        options.AddSecurityDefinition(JwtBearerDefaults.AuthenticationScheme, new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description =
                "Paste the token from data.accessToken of POST /api/auth/login. " +
                "Swagger adds the 'Bearer ' prefix for you.",
        });

        // Applied per operation rather than globally, so an endpoint that
        // genuinely needs no token — signing in — is not shown as locked.
        options.OperationFilter<AuthenticationOperationFilter>();
        options.OperationFilter<StandardResponsesOperationFilter>();
    }

    public static WebApplication UseAppDefaults(this WebApplication app)
    {
        // Request logging sits outside the exception handler so the line it
        // writes carries the status the caller actually received, not the
        // exception that the handler has already turned into a refusal.
        app.UseSerilogRequestLogging();

        app.UseMiddleware<ExceptionHandlingMiddleware>();
        app.UseEnvelopeStatusCodes();

        app.UseSwagger();
        app.UseSwaggerUI(options =>
        {
            options.DocumentTitle = "Team Progress Tracker API";
            options.DisplayRequestDuration();
            options.EnableTryItOutByDefault();
        });

        app.UseCors(CorsPolicy);

        app.UseAuthentication();
        app.UseAuthorization();

        app.MapGet("/health", () => Results.Ok(ApiResponse.Ok("Healthy.")))
            .AllowAnonymous()
            .ExcludeFromDescription();

        return app;
    }

    /// <summary>
    /// Answers the status codes the framework produces without a body of their
    /// own — an unmatched route, a rejected token, a route the gateway knows
    /// nothing about — in the same envelope as everything else, so a caller
    /// never has to parse two shapes.
    /// </summary>
    public static IApplicationBuilder UseEnvelopeStatusCodes(this IApplicationBuilder app) =>
        app.UseStatusCodePages(async context =>
        {
            var response = context.HttpContext.Response;

            response.ContentType = "application/json";

            await response.WriteAsync(JsonSerializer.Serialize(
                ApiResponse.Failure(response.StatusCode, DescribeStatus(response.StatusCode)),
                new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        });

    private static string DescribeStatus(int status) => status switch
    {
        StatusCodes.Status400BadRequest => "That request could not be read.",
        StatusCodes.Status401Unauthorized => "Please sign in again.",
        StatusCodes.Status403Forbidden => "You are not allowed to do that.",
        StatusCodes.Status404NotFound => "That endpoint does not exist.",
        StatusCodes.Status405MethodNotAllowed => "That method is not allowed here.",
        StatusCodes.Status415UnsupportedMediaType => "Send this as application/json.",
        _ => "Something went wrong. Please try again.",
    };
}

public static class AppPolicies
{
    public const string Admin = "admin";

    /// <summary>Admin or mentor, which the database called is_privileged().</summary>
    public const string Privileged = "privileged";
}
