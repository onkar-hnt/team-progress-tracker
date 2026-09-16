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

    Task<IReadOnlyList<MentorAssignment>> ListMentorAssignmentsAsync(
        CancellationToken cancellationToken);

    Task<IReadOnlyList<MentorAssignment>> ListMentorAssignmentsForMentorAsync(
        Guid mentorId,
        CancellationToken cancellationToken);

    Task<bool> DeveloperExistsAsync(Guid id, CancellationToken cancellationToken);

    Task<bool> MentorExistsAsync(Guid id, CancellationToken cancellationToken);

    Task<bool> ProjectExistsAsync(Guid id, CancellationToken cancellationToken);

    Task<bool> AllDevelopersExistAsync(IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken);

    Task<IReadOnlyList<Guid>> ListDeveloperProjectIdsAsync(
        Guid developerId,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<Guid>> ListActiveMentorIdsForDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken);

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
