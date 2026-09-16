using Microsoft.EntityFrameworkCore;

using SharedKernel;

using Team.Domain;

namespace Team.Infrastructure;

public sealed class TeamDbContext(DbContextOptions<TeamDbContext> options) : DbContext(options)
{
    public DbSet<Developer> Developers => Set<Developer>();
    public DbSet<Mentor> Mentors => Set<Mentor>();
    public DbSet<MentorAssignment> MentorAssignments => Set<MentorAssignment>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectDeveloper> ProjectDevelopers => Set<ProjectDeveloper>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Db.Team);

        modelBuilder.Entity<Developer>(developer =>
        {
            developer.ToTable(Db.Developers);
            developer.HasKey(row => row.Id);

            developer.Property(row => row.Code).HasMaxLength(20).IsRequired();
            developer.Property(row => row.Name).HasMaxLength(200).IsRequired();
            developer.Property(row => row.EmployeeId).HasMaxLength(50);
            developer.Property(row => row.Role).HasMaxLength(100);
            developer.Property(row => row.Location).HasMaxLength(100);
            developer.Property(row => row.Email).HasMaxLength(320);
            developer.Property(row => row.AccessRole).HasMaxLength(20);

            developer.HasIndex(row => row.Code).IsUnique();
            developer.HasIndex(row => row.ProfileId).IsUnique().HasFilter("[ProfileId] IS NOT NULL");
            developer.HasIndex(row => row.Email).IsUnique()
                .HasFilter("[DeletedAt] IS NULL AND [Email] IS NOT NULL");
            developer.HasIndex(row => row.EmployeeId).IsUnique()
                .HasFilter("[DeletedAt] IS NULL AND [EmployeeId] IS NOT NULL");
            developer.HasIndex(row => row.Active);
            developer.HasIndex(row => row.PrimaryProjectId);
            developer.HasIndex(row => row.DeletedAt);

            developer.HasOne(row => row.PrimaryProject)
                .WithMany()
                .HasForeignKey(row => row.PrimaryProjectId)
                .OnDelete(DeleteBehavior.SetNull);

            developer.ToTable(table =>
            {
                table.HasCheckConstraint(
                    "CK_Developers_AccessRole",
                    "[AccessRole] IS NULL OR [AccessRole] IN ('admin', 'mentor', 'developer')");
            });
        });

        modelBuilder.Entity<Mentor>(mentor =>
        {
            mentor.ToTable(Db.Mentors);
            mentor.HasKey(row => row.Id);

            mentor.Property(row => row.Code).HasMaxLength(20).IsRequired();
            mentor.Property(row => row.Name).HasMaxLength(200).IsRequired();
            mentor.Property(row => row.Email).HasMaxLength(320).IsRequired();

            mentor.HasIndex(row => row.Code).IsUnique();
            mentor.HasIndex(row => row.ProfileId).IsUnique().HasFilter("[ProfileId] IS NOT NULL");
            mentor.HasIndex(row => row.Email).IsUnique()
                .HasFilter("[DeletedAt] IS NULL");
            mentor.HasIndex(row => row.DeletedAt);
        });

        modelBuilder.Entity<MentorAssignment>(assignment =>
        {
            assignment.ToTable(Db.MentorAssignments);
            assignment.HasKey(row => row.Id);

            assignment.HasIndex(row => new { row.MentorId, row.DeveloperId }).IsUnique();
            assignment.HasIndex(row => row.DeveloperId);
            assignment.HasIndex(row => new { row.MentorId, row.DeveloperId })
                .HasDatabaseName("IX_MentorAssignments_MentorId_DeveloperId_Active")
                .HasFilter("[Active] = 1");

            assignment.HasOne(row => row.Mentor)
                .WithMany()
                .HasForeignKey(row => row.MentorId)
                .OnDelete(DeleteBehavior.Cascade);

            assignment.HasOne(row => row.Developer)
                .WithMany()
                .HasForeignKey(row => row.DeveloperId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Project>(project =>
        {
            project.ToTable(Db.Projects);
            project.HasKey(row => row.Id);

            project.Property(row => row.Code).HasMaxLength(20).IsRequired();
            project.Property(row => row.Name).HasMaxLength(200).IsRequired();
            project.Property(row => row.Client).HasMaxLength(200);
            project.Property(row => row.Description).HasColumnType("nvarchar(max)");
            project.Property(row => row.Status).HasMaxLength(20).IsRequired();

            project.HasIndex(row => row.Code).IsUnique();
            project.HasIndex(row => row.MentorId);
            project.HasIndex(row => row.Status);
            project.HasIndex(row => row.DeletedAt);

            project.HasOne(row => row.Mentor)
                .WithMany()
                .HasForeignKey(row => row.MentorId)
                .OnDelete(DeleteBehavior.SetNull);

            project.ToTable(table =>
            {
                table.HasCheckConstraint(
                    "CK_Projects_Status",
                    "[Status] IN ('planned', 'active', 'on-hold', 'completed')");

                table.HasCheckConstraint(
                    "CK_Projects_Dates",
                    "[EndDate] IS NULL OR [StartDate] IS NULL OR [EndDate] >= [StartDate]");
            });
        });

        modelBuilder.Entity<ProjectDeveloper>(membership =>
        {
            membership.ToTable(Db.ProjectDevelopers);
            membership.HasKey(row => new { row.ProjectId, row.DeveloperId });

            membership.HasIndex(row => row.DeveloperId);

            membership.HasOne(row => row.Project)
                .WithMany(project => project.Members)
                .HasForeignKey(row => row.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);

            membership.HasOne(row => row.Developer)
                .WithMany()
                .HasForeignKey(row => row.DeveloperId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
