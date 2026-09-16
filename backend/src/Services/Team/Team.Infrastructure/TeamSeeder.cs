using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

using SharedKernel;

using Team.Domain;

namespace Team.Infrastructure;

/// <summary>
/// Populates the roster when the database is empty so the UI has people and
/// projects to work with before provisioning links logins.
/// </summary>
public sealed class TeamSeeder(TeamDbContext context, IClock clock, ILogger<TeamSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (await context.Developers.AnyAsync(cancellationToken))
        {
            return;
        }

        var today = DateStrings.Today();
        var now = clock.Now;

        var mentor1Id = Guid.CreateVersion7();
        var mentor2Id = Guid.CreateVersion7();
        var project1Id = Guid.CreateVersion7();
        var project2Id = Guid.CreateVersion7();
        var project3Id = Guid.CreateVersion7();

        var mentor1 = new Mentor
        {
            Id = mentor1Id,
            Code = "MEN001",
            Name = "Alex Rivera",
            Email = "alex.rivera@handt.ai",
            Active = true,
            CreatedDate = today,
            CreatedAt = now,
            UpdatedAt = now,
        };

        var mentor2 = new Mentor
        {
            Id = mentor2Id,
            Code = "MEN002",
            Name = "Jordan Lee",
            Email = "jordan.lee@handt.ai",
            Active = true,
            CreatedDate = today,
            CreatedAt = now,
            UpdatedAt = now,
        };

        var project1 = new Project
        {
            Id = project1Id,
            Code = "PRJ001",
            Name = "Customer Portal",
            Client = "Acme Corp",
            Description = "Self-service portal for account management.",
            Status = "active",
            Active = true,
            StartDate = today.AddMonths(-2),
            MentorId = mentor1Id,
            CreatedAt = now,
            UpdatedAt = now,
        };

        var project2 = new Project
        {
            Id = project2Id,
            Code = "PRJ002",
            Name = "Analytics Dashboard",
            Client = "Acme Corp",
            Description = "Executive reporting and KPI views.",
            Status = "planned",
            Active = true,
            StartDate = today.AddMonths(-1),
            MentorId = mentor2Id,
            CreatedAt = now,
            UpdatedAt = now,
        };

        var project3 = new Project
        {
            Id = project3Id,
            Code = "PRJ003",
            Name = "Mobile Companion",
            Client = "Globex",
            Description = "Field app for technicians.",
            Status = "on-hold",
            Active = true,
            MentorId = mentor1Id,
            CreatedAt = now,
            UpdatedAt = now,
        };

        var developers = new[]
        {
            Dev("DEV001", "Sam Chen", "sam.chen@handt.ai", "Full Stack Developer", project1Id),
            Dev("DEV002", "Priya Patel", "priya.patel@handt.ai", "Backend Developer", project1Id),
            Dev("DEV003", "Chris Morgan", "chris.morgan@handt.ai", "Frontend Developer", project3Id),
            Dev("DEV004", "Taylor Brooks", "taylor.brooks@handt.ai", "QA Engineer", project2Id),
            Dev("DEV005", "Morgan Quinn", "morgan.quinn@handt.ai", "DevOps Engineer", project2Id),
            Dev("DEV006", "Riley Kim", "riley.kim@handt.ai", "UI Developer", project3Id),
        };

        foreach (var developer in developers)
        {
            developer.CreatedDate = today;
            developer.CreatedAt = now;
            developer.UpdatedAt = now;
        }

        context.Mentors.AddRange(mentor1, mentor2);
        context.Projects.AddRange(project1, project2, project3);
        context.Developers.AddRange(developers);

        await context.SaveChangesAsync(cancellationToken);

        var mentor1Devs = developers.Take(3).Select(row => row.Id).ToList();
        var mentor2Devs = developers.Skip(3).Select(row => row.Id).ToList();

        foreach (var developerId in mentor1Devs)
        {
            context.MentorAssignments.Add(new MentorAssignment
            {
                MentorId = mentor1Id,
                DeveloperId = developerId,
                AssignedDate = today,
                Active = true,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        foreach (var developerId in mentor2Devs)
        {
            context.MentorAssignments.Add(new MentorAssignment
            {
                MentorId = mentor2Id,
                DeveloperId = developerId,
                AssignedDate = today,
                Active = true,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        AddMembers(project1Id, [developers[0].Id, developers[1].Id], now);
        AddMembers(project2Id, [developers[3].Id, developers[4].Id], now);
        AddMembers(project3Id, [developers[2].Id, developers[5].Id], now);

        await context.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Seeded {DeveloperCount} developers, {MentorCount} mentors and {ProjectCount} projects.",
            developers.Length,
            2,
            3);
    }

    private void AddMembers(Guid projectId, IReadOnlyList<Guid> developerIds, DateTimeOffset createdAt)
    {
        foreach (var developerId in developerIds)
        {
            context.ProjectDevelopers.Add(new ProjectDeveloper
            {
                ProjectId = projectId,
                DeveloperId = developerId,
                CreatedAt = createdAt,
            });
        }
    }

    private static Developer Dev(
        string code,
        string name,
        string email,
        string role,
        Guid primaryProjectId) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            Code = code,
            Name = name,
            Email = email,
            Role = role,
            AccessRole = DomainRules.RoleDeveloper,
            Active = true,
            PrimaryProjectId = primaryProjectId,
        };
}
