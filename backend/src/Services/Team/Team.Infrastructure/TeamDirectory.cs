using Contracts;

using Microsoft.EntityFrameworkCore;

using Team.Domain;

namespace Team.Infrastructure;

public sealed class TeamDirectory(TeamDbContext context) : ITeamDirectory
{
    public async Task<RosterDeveloper?> FindDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken = default)
    {
        return await context.Developers
            .AsNoTracking()
            .Where(row => row.Id == developerId && row.DeletedAt == null)
            .Select(row => new RosterDeveloper(
                row.Id,
                row.Name,
                row.ProfileId,
                row.Active,
                row.PrimaryProjectId))
            .FirstOrDefaultAsync(cancellationToken);
    }

    public Task<bool> DeveloperExistsAsync(Guid developerId, CancellationToken cancellationToken = default) =>
        context.Developers.AnyAsync(
            row => row.Id == developerId && row.DeletedAt == null,
            cancellationToken);

    public Task<bool> ProjectExistsAsync(Guid projectId, CancellationToken cancellationToken = default) =>
        context.Projects.AnyAsync(
            row => row.Id == projectId && row.DeletedAt == null,
            cancellationToken);

    public Task<bool> MentorExistsAsync(Guid mentorId, CancellationToken cancellationToken = default) =>
        context.Mentors.AnyAsync(
            row => row.Id == mentorId && row.DeletedAt == null,
            cancellationToken);

    public async Task<IReadOnlyList<Guid>> GetAssignedDeveloperIdsAsync(
        Guid mentorId,
        CancellationToken cancellationToken = default)
    {
        return await context.MentorAssignments
            .AsNoTracking()
            .Where(row => row.MentorId == mentorId && row.Active)
            .Select(row => row.DeveloperId)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<MentorContact>> GetActiveMentorsForDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken = default)
    {
        return await context.MentorAssignments
            .AsNoTracking()
            .Where(row => row.DeveloperId == developerId && row.Active)
            .Join(
                context.Mentors.AsNoTracking().Where(mentor => mentor.DeletedAt == null && mentor.Active),
                assignment => assignment.MentorId,
                mentor => mentor.Id,
                (_, mentor) => new MentorContact(mentor.Id, mentor.Name, mentor.ProfileId))
            .ToListAsync(cancellationToken);
    }

    public async Task<Guid?> GetPrimaryMentorIdAsync(
        Guid developerId,
        CancellationToken cancellationToken = default)
    {
        return await context.MentorAssignments
            .AsNoTracking()
            .Where(row => row.DeveloperId == developerId && row.Active)
            .OrderByDescending(row => row.AssignedDate)
            .ThenByDescending(row => row.CreatedAt)
            .Select(row => (Guid?)row.MentorId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyDictionary<Guid, string>> GetDeveloperNamesAsync(
        CancellationToken cancellationToken = default)
    {
        var pairs = await context.Developers
            .AsNoTracking()
            .Where(row => row.DeletedAt == null)
            .Select(row => new { row.Id, row.Name })
            .ToListAsync(cancellationToken);

        return pairs.ToDictionary(pair => pair.Id, pair => pair.Name);
    }

    public async Task<IReadOnlyDictionary<Guid, string>> GetProjectNamesAsync(
        CancellationToken cancellationToken = default)
    {
        var pairs = await context.Projects
            .AsNoTracking()
            .Where(row => row.DeletedAt == null)
            .Select(row => new { row.Id, row.Name })
            .ToListAsync(cancellationToken);

        return pairs.ToDictionary(pair => pair.Id, pair => pair.Name);
    }
}
