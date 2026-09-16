using Contracts;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

using SharedKernel;

using Work.Domain;

namespace Work.Infrastructure;

public sealed class WorkSeeder(
    WorkDbContext context,
    ITeamDirectory teamDirectory,
    Work.Application.Rules.TaskEffortSynchronizer effortSync,
    Work.Application.IWorkStore store,
    IClock clock,
    ILogger<WorkSeeder> logger)
{
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        if (await context.Tasks.AnyAsync(cancellationToken))
        {
            return;
        }

        var developers = await teamDirectory.GetDeveloperNamesAsync(cancellationToken);

        if (developers.Count == 0)
        {
            logger.LogInformation("Skipping work seed because the roster has no developers yet.");
            return;
        }

        var projects = await teamDirectory.GetProjectNamesAsync(cancellationToken);
        var projectIds = projects.Keys.ToList();
        var today = DateStrings.Today();
        var now = clock.Now;
        var random = new Random(42);
        var taskCodeCounter = 1;
        var commentCodeCounter = 1;

        foreach (var developerId in developers.Keys)
        {
            var mentorId = await teamDirectory.GetPrimaryMentorIdAsync(developerId, cancellationToken);
            var chosenProjects = projectIds.OrderBy(_ => random.Next()).Take(Math.Min(2, projectIds.Count)).ToList();

            foreach (var projectId in chosenProjects)
            {
                for (var taskIndex = 0; taskIndex < 3; taskIndex++)
                {
                    var status = DomainRules.TaskStatuses[random.Next(DomainRules.TaskStatuses.Length)];
                    var task = new WorkTask
                    {
                        Code = $"TSK{taskCodeCounter++:D3}",
                        Name = $"{projects[projectId]} follow-up #{taskIndex + 1}",
                        ProjectId = projectId,
                        DeveloperId = developerId,
                        MentorId = mentorId,
                        Priority = DomainRules.TaskPriorities[random.Next(DomainRules.TaskPriorities.Length)],
                        Status = status,
                        CreatedDate = today.AddDays(-random.Next(1, 14)),
                        EstimatedHours = 16 + taskIndex * 4,
                        CreatedAt = now,
                        UpdatedAt = now,
                    };

                    context.Tasks.Add(task);

                    for (var dayOffset = 0; dayOffset < 5; dayOffset++)
                    {
                        var entryDate = today.AddDays(-dayOffset);
                        var hours = dayOffset % 2 == 0 ? (decimal?)random.Next(2, 7) : null;

                        context.DailyUpdates.Add(new DailyUpdate
                        {
                            DeveloperId = developerId,
                            ProjectId = projectId,
                            Task = task,
                            EntryDate = entryDate,
                            TaskTitle = task.Name,
                            WorkDone = "Implemented features and fixed defects.",
                            Status = task.Status,
                            Priority = task.Priority,
                            Progress = DomainRules.ProgressForStatus(task.Status) ?? random.Next(20, 90),
                            HoursSpent = hours,
                            IsBlocked = dayOffset == 4 && taskIndex == 0,
                            BlockerDescription = dayOffset == 4 && taskIndex == 0 ? "Waiting on API credentials." : null,
                            CreatedAt = now,
                            UpdatedAt = now,
                        });
                    }

                    if (taskIndex == 0)
                    {
                        context.Feedback.Add(new Feedback
                        {
                            Code = $"CMT{commentCodeCounter++:D3}",
                            DeveloperId = developerId,
                            MentorId = mentorId,
                            Task = task,
                            ProjectId = projectId,
                            FeedbackDate = today.AddDays(-2),
                            Comment = "Please share a short status update on blockers.",
                            AuthorRole = DomainRules.RoleMentor,
                            CreatedAt = now,
                            UpdatedAt = now,
                        });

                        context.Feedback.Add(new Feedback
                        {
                            Code = $"CMT{commentCodeCounter++:D3}",
                            DeveloperId = developerId,
                            Task = task,
                            ProjectId = projectId,
                            FeedbackDate = today.AddDays(-1),
                            Comment = "Blocked on credentials; everything else is on track.",
                            AuthorRole = DomainRules.RoleDeveloper,
                            CreatedAt = now,
                            UpdatedAt = now,
                        });
                    }
                }
            }
        }

        await context.SaveChangesAsync(cancellationToken);

        var taskIds = await context.Tasks.Select(row => row.Id).ToListAsync(cancellationToken);
        await effortSync.RecomputeAsync(taskIds, null, cancellationToken);
        await store.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Seeded work tasks, daily updates and comments.");
    }
}
