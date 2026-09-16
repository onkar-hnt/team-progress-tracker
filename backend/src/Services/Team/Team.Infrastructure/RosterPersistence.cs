using Microsoft.EntityFrameworkCore;

using SharedKernel;

using Team.Application;
using Team.Domain;

namespace Team.Infrastructure;

public sealed class RosterPersistence(
    TeamDbContext context,
    BusinessCodeAllocator codes,
    WorkDependencyGuard workGuard) : IRosterPersistence
{
    public async Task<IReadOnlyList<Developer>> ListDevelopersAsync(CancellationToken cancellationToken) =>
        await context.Developers
            .AsNoTracking()
            .Where(row => row.DeletedAt == null)
            .ToListAsync(cancellationToken);

    public Task<Developer?> FindDeveloperAsync(Guid id, CancellationToken cancellationToken) =>
        context.Developers.FirstOrDefaultAsync(
            row => row.Id == id && row.DeletedAt == null,
            cancellationToken);

    public async Task<IReadOnlyList<Mentor>> ListMentorsAsync(CancellationToken cancellationToken) =>
        await context.Mentors
            .AsNoTracking()
            .Where(row => row.DeletedAt == null)
            .ToListAsync(cancellationToken);

    public Task<Mentor?> FindMentorAsync(Guid id, CancellationToken cancellationToken) =>
        context.Mentors.FirstOrDefaultAsync(
            row => row.Id == id && row.DeletedAt == null,
            cancellationToken);

    public async Task<IReadOnlyList<Project>> ListProjectsAsync(CancellationToken cancellationToken) =>
        await context.Projects
            .AsNoTracking()
            .Where(row => row.DeletedAt == null)
            .ToListAsync(cancellationToken);

    public Task<Project?> FindProjectAsync(Guid id, CancellationToken cancellationToken) =>
        context.Projects.FirstOrDefaultAsync(
            row => row.Id == id && row.DeletedAt == null,
            cancellationToken);

    public async Task<IReadOnlyList<Guid>> GetProjectMemberIdsAsync(
        Guid projectId,
        CancellationToken cancellationToken) =>
        await context.ProjectDevelopers
            .AsNoTracking()
            .Where(row => row.ProjectId == projectId)
            .Select(row => row.DeveloperId)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyDictionary<Guid, IReadOnlyList<Guid>>> GetAllProjectMembersAsync(
        CancellationToken cancellationToken)
    {
        var rows = await context.ProjectDevelopers
            .AsNoTracking()
            .Select(row => new { row.ProjectId, row.DeveloperId })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(row => row.ProjectId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyList<Guid>)[.. group.Select(item => item.DeveloperId)]);
    }

    public async Task<IReadOnlyList<MentorAssignment>> ListMentorAssignmentsAsync(
        CancellationToken cancellationToken) =>
        await context.MentorAssignments.AsNoTracking().ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<MentorAssignment>> ListMentorAssignmentsForMentorAsync(
        Guid mentorId,
        CancellationToken cancellationToken) =>
        await context.MentorAssignments
            .Where(row => row.MentorId == mentorId)
            .ToListAsync(cancellationToken);

    public Task<bool> DeveloperExistsAsync(Guid id, CancellationToken cancellationToken) =>
        context.Developers.AnyAsync(row => row.Id == id && row.DeletedAt == null, cancellationToken);

    public Task<bool> MentorExistsAsync(Guid id, CancellationToken cancellationToken) =>
        context.Mentors.AnyAsync(row => row.Id == id && row.DeletedAt == null, cancellationToken);

    public Task<bool> ProjectExistsAsync(Guid id, CancellationToken cancellationToken) =>
        context.Projects.AnyAsync(row => row.Id == id && row.DeletedAt == null, cancellationToken);

    public async Task<bool> AllDevelopersExistAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken cancellationToken)
    {
        if (ids.Count == 0)
        {
            return true;
        }

        var found = await context.Developers
            .Where(row => ids.Contains(row.Id) && row.DeletedAt == null)
            .CountAsync(cancellationToken);

        return found == ids.Count;
    }

    public async Task<IReadOnlyList<Guid>> ListDeveloperProjectIdsAsync(
        Guid developerId,
        CancellationToken cancellationToken) =>
        await context.ProjectDevelopers
            .AsNoTracking()
            .Where(row => row.DeveloperId == developerId)
            .Select(row => row.ProjectId)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Guid>> ListActiveMentorIdsForDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken) =>
        await context.MentorAssignments
            .AsNoTracking()
            .Where(row => row.DeveloperId == developerId && row.Active)
            .Select(row => row.MentorId)
            .ToListAsync(cancellationToken);

    public void AddDeveloper(Developer developer) => context.Developers.Add(developer);

    public void AddMentor(Mentor mentor) => context.Mentors.Add(mentor);

    public void AddProject(Project project) => context.Projects.Add(project);

    public void AddMentorAssignment(MentorAssignment assignment) =>
        context.MentorAssignments.Add(assignment);

    public void AddProjectMember(ProjectDeveloper membership) =>
        context.ProjectDevelopers.Add(membership);

    public void RemoveMentorAssignment(MentorAssignment assignment) =>
        context.MentorAssignments.Remove(assignment);

    public async Task ReplaceProjectMembersAsync(
        Guid projectId,
        IReadOnlyList<Guid> developerIds,
        DateTimeOffset createdAt,
        CancellationToken cancellationToken)
    {
        if (!await ProjectExistsAsync(projectId, cancellationToken))
        {
            throw new NotFoundException("That project is no longer on the roster.");
        }

        var existing = await context.ProjectDevelopers
            .Where(row => row.ProjectId == projectId)
            .ToListAsync(cancellationToken);

        context.ProjectDevelopers.RemoveRange(existing);

        foreach (var developerId in developerIds.Distinct())
        {
            context.ProjectDevelopers.Add(new ProjectDeveloper
            {
                ProjectId = projectId,
                DeveloperId = developerId,
                CreatedAt = createdAt,
            });
        }
    }

    public void RemoveDeveloper(Developer developer) => context.Developers.Remove(developer);

    public void RemoveMentor(Mentor mentor) => context.Mentors.Remove(mentor);

    public void RemoveProject(Project project) => context.Projects.Remove(project);

    public void Detach(Developer developer) => context.Entry(developer).State = EntityState.Detached;

    public void Detach(Mentor mentor) => context.Entry(mentor).State = EntityState.Detached;

    public void Detach(Project project) => context.Entry(project).State = EntityState.Detached;

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        try
        {
            await context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            throw UniqueViolationMapper.TryMap(exception) ?? exception;
        }
    }

    public Task<string> AllocateDeveloperCodeAsync(CancellationToken cancellationToken) =>
        codes.NextDeveloperCodeAsync(cancellationToken);

    public Task<string> AllocateMentorCodeAsync(CancellationToken cancellationToken) =>
        codes.NextMentorCodeAsync(cancellationToken);

    public Task<string> AllocateProjectCodeAsync(CancellationToken cancellationToken) =>
        codes.NextProjectCodeAsync(cancellationToken);

    public Task EnsureDeveloperCanBeRemovedAsync(Guid developerId, CancellationToken cancellationToken) =>
        workGuard.EnsureDeveloperCanBeRemovedAsync(developerId, cancellationToken);

    public Task EnsureMentorCanBeRemovedAsync(Guid mentorId, CancellationToken cancellationToken) =>
        workGuard.EnsureMentorCanBeRemovedAsync(mentorId, cancellationToken);

    public Task EnsureProjectCanBeRemovedAsync(Guid projectId, CancellationToken cancellationToken) =>
        workGuard.EnsureProjectCanBeRemovedAsync(projectId, cancellationToken);
}
