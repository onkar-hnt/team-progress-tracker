namespace Contracts;

public sealed record RosterDeveloper(
    Guid Id,
    string Name,
    Guid? ProfileId,
    bool Active,
    Guid? PrimaryProjectId);

public sealed record MentorContact(Guid MentorId, string Name, Guid? ProfileId);

/// <summary>
/// The narrow read the work, notification and reporting services need into the
/// roster: who a developer's mentors are, who a mentor may see, and whether a
/// referenced row exists. Kept as a contract so those services depend on this
/// and not on the Team service's tables, which is what makes it possible to
/// move the roster behind an HTTP call later without touching them.
/// </summary>
public interface ITeamDirectory
{
    Task<RosterDeveloper?> FindDeveloperAsync(Guid developerId, CancellationToken cancellationToken = default);

    Task<bool> DeveloperExistsAsync(Guid developerId, CancellationToken cancellationToken = default);

    Task<bool> ProjectExistsAsync(Guid projectId, CancellationToken cancellationToken = default);

    Task<bool> MentorExistsAsync(Guid mentorId, CancellationToken cancellationToken = default);

    /// <summary>Developers a mentor is actively assigned to.</summary>
    Task<IReadOnlyList<Guid>> GetAssignedDeveloperIdsAsync(
        Guid mentorId,
        CancellationToken cancellationToken = default);

    /// <summary>Mentors actively assigned to a developer, for notifying them.</summary>
    Task<IReadOnlyList<MentorContact>> GetActiveMentorsForDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// The mentor a task created from a daily update is attributed to: the
    /// newest active assignment, or none.
    /// </summary>
    Task<Guid?> GetPrimaryMentorIdAsync(Guid developerId, CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<Guid, string>> GetDeveloperNamesAsync(CancellationToken cancellationToken = default);

    Task<IReadOnlyDictionary<Guid, string>> GetProjectNamesAsync(CancellationToken cancellationToken = default);
}
