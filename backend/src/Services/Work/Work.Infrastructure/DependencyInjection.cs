using Contracts;

using FluentValidation;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

using Persistence;

using SharedKernel;

using Work.Application;
using Work.Application.Rules;

namespace Work.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddWorkServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton<IClock, SystemClock>();
        services.Configure<RetentionOptions>(configuration.GetSection(RetentionOptions.Section));

        services.AddScoped<AuditInterceptor>();
        services.AddScoped<ChangeHistoryInterceptor>();
        services.AddScoped<IChangeHistoryActorResolver, ChangeHistoryActorResolver>();

        services.AddDbContext<WorkDbContext>((provider, options) =>
        {
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                sql => sql.MigrationsHistoryTable("__EFMigrationsHistory", Db.Work));

            options.AddInterceptors(
                provider.GetRequiredService<AuditInterceptor>(),
                provider.GetRequiredService<ChangeHistoryInterceptor>());
        });

        services.AddSingleton<WorkConnectionFactory>();
        services.AddScoped<IAccessScopeProvider, WorkAccessScopeProvider>();
        services.AddScoped<ITeamDirectory, SqlTeamDirectory>();
        services.AddScoped<INotificationPublisher, SqlNotificationPublisher>();
        services.AddScoped<IWorkStore, WorkStore>();
        services.AddScoped<IRecycleBinGateway, SqlRecycleBinGateway>();
        services.AddScoped<WorkBusinessCodeAllocator>();
        services.AddScoped<WorkBusinessCodeRetry>();
        services.AddScoped<WorkSyncContext>();

        services.AddScoped<DailyUpdateTaskEnsurer>();
        services.AddScoped<DailyUpdateTaskLinkApplier>();
        services.AddScoped<EntryStatusToTaskSynchronizer>();
        services.AddScoped<TaskStatusToEntriesSynchronizer>();
        services.AddScoped<TaskEffortSynchronizer>();
        services.AddScoped<FeedbackAuthorStamper>();
        services.AddScoped<FeedbackTaskGuard>();

        services.AddScoped<TaskService>();
        services.AddScoped<DailyWorkEntryService>();
        services.AddScoped<CommentService>();
        services.AddScoped<ChangeLogService>();
        services.AddScoped<RecycleBinService>();

        services.AddHostedService<RetentionBackgroundService>();

        services.AddValidatorsFromAssemblyContaining<SaveTaskRequestValidator>();

        return services;
    }
}
