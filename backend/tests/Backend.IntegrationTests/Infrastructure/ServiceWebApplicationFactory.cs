using System.Text;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

using SharedKernel;

using Work.Infrastructure;

namespace Backend.IntegrationTests.Infrastructure;

public sealed class ServiceWebApplicationFactory<TEntryPoint> : WebApplicationFactory<TEntryPoint>
    where TEntryPoint : class
{
    private readonly string _connectionString;

    public ServiceWebApplicationFactory(string connectionString) =>
        _connectionString = connectionString;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = _connectionString,
                ["Jwt:SigningKey"] = TestConfiguration.JwtSigningKey,
                ["Jwt:Issuer"] = "team-progress-tracker",
                ["Jwt:Audience"] = "team-progress-tracker-app",
                ["Seed:AdminEmail"] = TestConfiguration.AdminEmail,
                ["Seed:AdminPassword"] = TestConfiguration.AdminPassword,
                ["Seed:AdminName"] = TestConfiguration.AdminDisplayName,
                ["Database:MigrateOnStartup"] = "false",
                ["Cors:AllowedOrigins:0"] = "http://localhost:5173",
            });
        });

        builder.ConfigureTestServices(services =>
        {
            foreach (var descriptor in services
                         .Where(description => description.ServiceType == typeof(IHostedService)
                                               && description.ImplementationType == typeof(RetentionBackgroundService))
                         .ToList())
            {
                services.Remove(descriptor);
            }

            // appsettings.Local.json beside each API is loaded after the in-memory
            // collection above, so without this every service would disagree on the
            // signing key and the seeded administrator password.
            services.PostConfigure<JwtOptions>(options =>
            {
                options.SigningKey = TestConfiguration.JwtSigningKey;
                options.Issuer = "team-progress-tracker";
                options.Audience = "team-progress-tracker-app";
            });

            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = "team-progress-tracker",
                    ValidAudience = "team-progress-tracker-app",
                    IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(TestConfiguration.JwtSigningKey)),
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
            });
        });
    }
}
