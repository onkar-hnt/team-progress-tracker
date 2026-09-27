using Team.Domain;

namespace Team.Application;

public interface IRosterPersistence
{
    Task<IReadOnlyList<Developer>> ListDevelopersAsync(CancellationToken cancellationToken);

    Task<Developer?> FindDeveloperAsync(Guid id, CancellationToken cancellationToken);

    Task<IReadOnlyList<Mentor>> ListMentorsAsync(CancellationToken cancellationToken);

    Task<Mentor?> FindMentorAsync(Guid id, CancellationToken cancellationToken);

    Task<IReadOnlyList<Project>> ListProjectsAsync(CancellationToken cancellationToken);

    Task<Project?> FindProjectAsync(Guid id, CancellationToken cancellationToken);

    Task<IReadOnlyList<Guid>> GetProjectMemberIdsAsync(Guid projectId, CancellationToken cancellationToken);

    Task<IReadOnlyDictionary<Guid, IReadOnlyList<Guid>>> GetAllProjectMembersAsync(
        CancellationToken cancellationToken);

    Task<IReadOnlyList<Guid>> GetProjectMentorIdsAsync(Guid projectId, CancellationToken cancellationToken);

    Task<IReadOnlyDictionary<Guid, IReadOnlyList<Guid>>> GetAllProjectMentorsAsync(
        CancellationToken cancellationToken);

    Task<IReadOnlyList<MentorAssignment>> ListMentorAssignmentsAsync(
        CancellationToken cancellationToken);

    Task<IReadOnlyList<MentorAssignment>> ListMentorAssignmentsForMentorAsync(
        Guid mentorId,
        CancellationToken cancellationToken);

    Task<bool> DeveloperExistsAsync(Guid id, CancellationToken cancellationToken);

    Task<bool> MentorExistsAsync(Guid id, CancellationToken cancellationToken);

    Task<bool> ProjectExistsAsync(Guid id, CancellationToken cancellationToken);

    Task<bool> AllDevelopersExistAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken);

    Task<bool> AllMentorsExistAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken);

    Task<IReadOnlyList<Guid>> ListDeveloperProjectIdsAsync(
        Guid developerId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<Guid>> ListActiveMentorIdsForDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<LeaveDay>> ListLeaveDaysAsync(
        DateOnly? from,
        DateOnly? to,
        IReadOnlyCollection<Guid>? developerIds,
        CancellationToken cancellationToken);

    Task<LeaveDay?> FindLeaveDayAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>
    /// True when the day is already accounted for. The unique index is what
    /// actually stops a second row, so this only exists to answer with a
    /// conflict rather than a constraint violation.
    /// </summary>
    Task<bool> LeaveDayExistsAsync(Guid developerId, DateOnly date, CancellationToken cancellationToken);

    void AddLeaveDay(LeaveDay leaveDay);

    void RemoveLeaveDay(LeaveDay leaveDay);

    void AddDeveloper(Developer developer);

    void AddMentor(Mentor mentor);

    void AddProject(Project project);

    void AddMentorAssignment(MentorAssignment assignment);

    void RemoveMentorAssignment(MentorAssignment assignment);

    Task ReplaceProjectMembersAsync(
        Guid projectId,
        IReadOnlyList<Guid> developerIds,
        DateTimeOffset createdAt,
        CancellationToken cancellationToken);

    Task ReplaceProjectMentorsAsync(
        Guid projectId,
        IReadOnlyList<Guid> mentorIds,
        DateTimeOffset createdAt,
        CancellationToken cancellationToken);

    void RemoveDeveloper(Developer developer);

    void RemoveMentor(Mentor mentor);

    void RemoveProject(Project project);

    Task SaveChangesAsync(CancellationToken cancellationToken);

    Task<string> AllocateDeveloperCodeAsync(CancellationToken cancellationToken);

    Task<string> AllocateMentorCodeAsync(CancellationToken cancellationToken);

    Task<string> AllocateProjectCodeAsync(CancellationToken cancellationToken);

    Task EnsureDeveloperCanBeRemovedAsync(Guid developerId, CancellationToken cancellationToken);

    Task EnsureMentorCanBeRemovedAsync(Guid mentorId, CancellationToken cancellationToken);

    Task EnsureProjectCanBeRemovedAsync(Guid projectId, CancellationToken cancellationToken);

    void Detach(Developer developer);

    void Detach(Mentor mentor);

    void Detach(Project project);
}
