using Contracts;

using FluentValidation;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

using Notifications.Application;

using Persistence;

using SharedKernel;

namespace Notifications.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddNotificationServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<AuditInterceptor>();
        services.AddScoped<UserPreferencesAuditInterceptor>();
        services.AddScoped<NotificationUpdateGuardInterceptor>();

        services.AddDbContext<NotificationsDbContext>((provider, options) =>
        {
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                sql => sql.MigrationsHistoryTable("__EFMigrationsHistory", Db.Notify));

            options.AddInterceptors(
                provider.GetRequiredService<AuditInterceptor>(),
                provider.GetRequiredService<UserPreferencesAuditInterceptor>(),
                provider.GetRequiredService<NotificationUpdateGuardInterceptor>());
        });

        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<INotificationPublisher, NotificationDispatcher>();
        services.AddScoped<NotificationService>();

        services.AddValidatorsFromAssemblyContaining<NotificationPreferencesDtoValidator>();

        return services;
    }
}
