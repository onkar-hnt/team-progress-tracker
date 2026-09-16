using Contracts;

using FluentValidation;

using Identity.Application;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

using Persistence;

using SharedKernel;

namespace Identity.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddIdentityServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<AuditInterceptor>();

        services.AddDbContext<IdentityDbContext>((provider, options) =>
        {
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                sql => sql.MigrationsHistoryTable("__EFMigrationsHistory", Db.Identity));

            options.AddInterceptors(provider.GetRequiredService<AuditInterceptor>());
        });

        services.AddScoped<IProfileRepository, ProfileRepository>();
        services.AddScoped<IRosterGateway, SqlRosterGateway>();
        services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
        services.AddScoped<ITokenIssuer, JwtTokenIssuer>();

        services.AddScoped<AuthService>();
        services.AddScoped<AccountService>();

        services.AddValidatorsFromAssemblyContaining<SignInRequestValidator>();

        return services;
    }
}
