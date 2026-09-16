using Contracts;

using FluentValidation;

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

using Reporting.Application;

using SharedKernel;

namespace Reporting.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddReportingServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<UsageOptions>(configuration.GetSection(UsageOptions.Section));

        services.AddSingleton<ReportingConnectionFactory>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IWorkEntryReader, SqlWorkEntryReader>();
        services.AddScoped<IUsageReader, SqlUsageReader>();
        services.AddScoped<ITeamDirectory, SqlTeamDirectory>();
        services.AddScoped<ReportAccessScopeFactory>();
        services.AddScoped<ReportService>();
        services.AddScoped<UsageService>();

        services.AddValidatorsFromAssemblyContaining<ReportDateRangeQueryValidator>();

        return services;
    }
}
