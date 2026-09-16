using Contracts;

using FluentValidation;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

using Persistence;

using SharedKernel;

using Team.Application;

namespace Team.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddTeamServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<AuditInterceptor>();

        services.AddDbContext<TeamDbContext>((provider, options) =>
        {
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                sql => sql.MigrationsHistoryTable("__EFMigrationsHistory", Db.Team));

            options.AddInterceptors(provider.GetRequiredService<AuditInterceptor>());
        });

        services.AddScoped<IAccessScopeProvider, TeamAccessScopeProvider>();
        services.AddScoped<IRosterPersistence, RosterPersistence>();
        services.AddScoped<ITeamDirectory, TeamDirectory>();
        services.AddScoped<BusinessCodeAllocator>();
        services.AddScoped<WorkDependencyGuard>();

        services.AddScoped<DeveloperService>();
        services.AddScoped<MentorService>();
        services.AddScoped<ProjectService>();
        services.AddScoped<MentorAssignmentService>();

        services.AddValidatorsFromAssemblyContaining<SaveDeveloperRequestValidator>();

        return services;
    }
}
