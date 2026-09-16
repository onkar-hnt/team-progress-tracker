using Microsoft.EntityFrameworkCore;

using Persistence;

using SharedKernel;

using Work.Domain;

namespace Work.Infrastructure;

public sealed class WorkDbContext(DbContextOptions<WorkDbContext> options)
    : DbContext(options), IRecordHistorySink
{
    public DbSet<WorkTask> Tasks => Set<WorkTask>();
    public DbSet<DailyUpdate> DailyUpdates => Set<DailyUpdate>();
    public DbSet<Feedback> Feedback => Set<Feedback>();
    public DbSet<RecordHistory> RecordHistories => Set<RecordHistory>();

    public void EnqueueRecordHistory(PendingRecordHistory entry) =>
        RecordHistories.Add(new RecordHistory
        {
            Id = entry.Id,
            TableName = entry.TableName,
            RecordId = entry.RecordId,
            Action = entry.Action,
            Subject = entry.Subject,
            SubjectDeveloperId = entry.SubjectDeveloperId,
            ChangedBy = entry.ChangedBy,
            ChangedByName = entry.ChangedByName,
            ChangedAt = entry.ChangedAt,
            Changes = entry.Changes,
        });

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Db.Work);

        var statusCheck = InList(DomainRules.TaskStatuses);
        var priorityCheck = InList(DomainRules.TaskPriorities);
        var roleCheck = InList(DomainRules.Roles);
        var historyTableCheck = InList(DomainRules.HistoryTables);
        var historyActionCheck = InList(DomainRules.HistoryActions);

        modelBuilder.Entity<WorkTask>(task =>
        {
            task.ToTable(Db.Tasks);
            task.HasKey(row => row.Id);

            task.Property(row => row.Code).HasMaxLength(20).IsRequired();
            task.Property(row => row.Name).HasMaxLength(200).IsRequired();
            task.Property(row => row.Description).HasColumnType("nvarchar(max)");
            task.Property(row => row.Priority).HasMaxLength(20).IsRequired().HasDefaultValue("medium");
            task.Property(row => row.Status).HasMaxLength(20).IsRequired().HasDefaultValue(DomainRules.TaskNotStarted);
            task.Property(row => row.CreatedDate).HasDefaultValueSql("CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'UTC' AS date)");
            task.Property(row => row.EstimatedHours).HasPrecision(6, 2);
            task.Property(row => row.ActualHours).HasPrecision(7, 2).HasDefaultValue(0m);
            task.Property(row => row.WorkedDays).HasDefaultValue(0);

            task.HasIndex(row => row.Code).IsUnique();
            task.HasIndex(row => row.DeveloperId);
            task.HasIndex(row => row.ProjectId);
            task.HasIndex(row => row.MentorId);
            task.HasIndex(row => new { row.DeveloperId, row.Status });
            task.HasIndex(row => row.DueDate).HasFilter("[DueDate] IS NOT NULL");
            task.HasIndex(row => row.DeletedAt).HasFilter("[DeletedAt] IS NOT NULL");

            task.ToTable(table =>
            {
                table.HasCheckConstraint("CK_Tasks_Priority", $"[Priority] IN ({priorityCheck})");
                table.HasCheckConstraint("CK_Tasks_Status", $"[Status] IN ({statusCheck})");
                table.HasCheckConstraint(
                    "CK_Tasks_EstimatedHours",
                    "[EstimatedHours] IS NULL OR [EstimatedHours] >= 0");
            });
        });

        modelBuilder.Entity<DailyUpdate>(entry =>
        {
            entry.ToTable(Db.DailyUpdates);
            entry.HasKey(row => row.Id);

            entry.Property(row => row.TaskTitle).HasMaxLength(300).IsRequired();
            entry.Property(row => row.Description).HasColumnType("nvarchar(max)");
            entry.Property(row => row.WorkDone).HasColumnType("nvarchar(max)");
            entry.Property(row => row.PlannedWork).HasColumnType("nvarchar(max)");
            entry.Property(row => row.Status).HasMaxLength(20).IsRequired().HasDefaultValue(DomainRules.TaskInProgress);
            entry.Property(row => row.Priority).HasMaxLength(20).IsRequired().HasDefaultValue("medium");
            entry.Property(row => row.Progress).HasDefaultValue(0);
            entry.Property(row => row.HoursSpent).HasPrecision(5, 2);
            entry.Property(row => row.EstimatedHours).HasPrecision(6, 2);
            entry.Property(row => row.BlockerDescription).HasColumnType("nvarchar(max)");
            entry.Property(row => row.Remarks).HasColumnType("nvarchar(max)");
            entry.Property(row => row.IsBlocked).HasDefaultValue(false);

            entry.HasIndex(row => new { row.DeveloperId, row.EntryDate });
            entry.HasIndex(row => row.ProjectId);
            entry.HasIndex(row => row.EntryDate);
            entry.HasIndex(row => row.IsBlocked).HasFilter("[IsBlocked] = 1");
            entry.HasIndex(row => row.TaskId).HasFilter("[TaskId] IS NOT NULL");
            entry.HasIndex(row => row.DeletedAt).HasFilter("[DeletedAt] IS NOT NULL");

            entry.HasOne(row => row.Task)
                .WithMany(task => task.DailyUpdates)
                .HasForeignKey(row => row.TaskId)
                .OnDelete(DeleteBehavior.SetNull);

            entry.ToTable(table =>
            {
                table.HasCheckConstraint("CK_DailyUpdates_Priority", $"[Priority] IN ({priorityCheck})");
                table.HasCheckConstraint("CK_DailyUpdates_Status", $"[Status] IN ({statusCheck})");
                table.HasCheckConstraint("CK_DailyUpdates_Progress", "[Progress] >= 0 AND [Progress] <= 100");
                table.HasCheckConstraint(
                    "CK_DailyUpdates_HoursSpent",
                    "[HoursSpent] IS NULL OR [HoursSpent] >= 0");
                table.HasCheckConstraint(
                    "CK_DailyUpdates_EstimatedHours",
                    "[EstimatedHours] IS NULL OR [EstimatedHours] >= 0");
            });
        });

        modelBuilder.Entity<Feedback>(comment =>
        {
            comment.ToTable(Db.Feedback);
            comment.HasKey(row => row.Id);

            comment.Property(row => row.Code).HasMaxLength(20).IsRequired();
            comment.Property(row => row.Comment).HasColumnType("nvarchar(max)").IsRequired();
            comment.Property(row => row.ProgressUpdate).HasColumnType("nvarchar(max)");
            comment.Property(row => row.Blockers).HasColumnType("nvarchar(max)");
            comment.Property(row => row.Recommendations).HasColumnType("nvarchar(max)");
            comment.Property(row => row.AuthorRole).HasMaxLength(20).IsRequired();
            comment.Property(row => row.FeedbackDate).HasDefaultValueSql("CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'UTC' AS date)");

            comment.HasIndex(row => row.Code).IsUnique();
            comment.HasIndex(row => new { row.DeveloperId, row.FeedbackDate });
            comment.HasIndex(row => row.MentorId);
            comment.HasIndex(row => row.ProjectId);
            comment.HasIndex(row => new { row.TaskId, row.CreatedAt }).HasFilter("[TaskId] IS NOT NULL");
            comment.HasIndex(row => row.DeletedAt).HasFilter("[DeletedAt] IS NOT NULL");

            comment.HasOne(row => row.Task)
                .WithMany()
                .HasForeignKey(row => row.TaskId)
                .OnDelete(DeleteBehavior.SetNull);

            comment.ToTable(table =>
            {
                table.HasCheckConstraint("CK_Feedback_AuthorRole", $"[AuthorRole] IN ({roleCheck})");
            });
        });

        modelBuilder.Entity<RecordHistory>(history =>
        {
            history.ToTable(Db.RecordHistory);
            history.HasKey(row => row.Id);

            history.Property(row => row.TableName).HasMaxLength(40).IsRequired();
            history.Property(row => row.Action).HasMaxLength(20).IsRequired();
            history.Property(row => row.Subject).HasMaxLength(120).IsRequired().HasDefaultValue(string.Empty);
            history.Property(row => row.ChangedByName).HasMaxLength(200).IsRequired().HasDefaultValue(string.Empty);
            history.Property(row => row.Changes).HasColumnType("nvarchar(max)").IsRequired().HasDefaultValue("{}");

            history.HasIndex(row => row.ChangedAt).IsDescending();
            history.HasIndex(row => new { row.TableName, row.RecordId });
            history.HasIndex(row => row.SubjectDeveloperId).HasFilter("[SubjectDeveloperId] IS NOT NULL");

            history.ToTable(table =>
            {
                table.HasCheckConstraint("CK_RecordHistory_TableName", $"[TableName] IN ({historyTableCheck})");
                table.HasCheckConstraint("CK_RecordHistory_Action", $"[Action] IN ({historyActionCheck})");
            });
        });
    }

    private static string InList(IReadOnlyList<string> values) =>
        string.Join(", ", values.Select(value => $"'{value}'"));
}
