using System.Text;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

using SharedKernel;

namespace ApiGateway;

/// <summary>
/// Validates bearer tokens at the edge so middleware can read claims without
/// turning away anonymous routes such as sign-in and health.
/// </summary>
public static class GatewayAuthExtensions
{
    public static IServiceCollection AddGatewayJwtValidation(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.Section));

        var jwt = configuration.GetSection(JwtOptions.Section).Get<JwtOptions>() ?? new JwtOptions();

        if (string.IsNullOrWhiteSpace(jwt.SigningKey))
        {
            throw new InvalidOperationException(
                "Jwt:SigningKey is not configured. Copy backend/appsettings.Local.example.json to " +
                "appsettings.Local.json beside this project, or set the Jwt__SigningKey " +
                "environment variable. It must match the key the Identity service signs with.");
        }

        services
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

        return services;
    }
}
