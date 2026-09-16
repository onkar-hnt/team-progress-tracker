using Contracts;

namespace Backend.UnitTests.Fakes;

internal sealed class FakeTeamDirectory : ITeamDirectory
{
    private readonly Dictionary<Guid, RosterDeveloper> _developers = [];
    private readonly Dictionary<Guid, List<MentorContact>> _mentorsByDeveloper = [];
    private readonly Dictionary<Guid, Guid?> _primaryMentor = [];
    private readonly Dictionary<Guid, List<Guid>> _assignedByMentor = [];

    public void SeedDeveloper(Guid id, string name, Guid? profileId = null) =>
        _developers[id] = new RosterDeveloper(id, name, profileId, true, null);

    public void SeedMentorsForDeveloper(Guid developerId, params MentorContact[] mentors) =>
        _mentorsByDeveloper[developerId] = [.. mentors];

    public void SeedPrimaryMentor(Guid developerId, Guid? mentorId) =>
        _primaryMentor[developerId] = mentorId;

    public void SeedAssignedDevelopers(Guid mentorId, params Guid[] developerIds) =>
        _assignedByMentor[mentorId] = [.. developerIds];

    public Task<RosterDeveloper?> FindDeveloperAsync(Guid developerId, CancellationToken cancellationToken) =>
        Task.FromResult(_developers.TryGetValue(developerId, out var developer) ? developer : null);

    public Task<bool> DeveloperExistsAsync(Guid developerId, CancellationToken cancellationToken) =>
        Task.FromResult(_developers.ContainsKey(developerId));

    public Task<bool> ProjectExistsAsync(Guid projectId, CancellationToken cancellationToken) =>
        Task.FromResult(true);

    public Task<bool> MentorExistsAsync(Guid mentorId, CancellationToken cancellationToken) =>
        Task.FromResult(true);

    public Task<IReadOnlyList<Guid>> GetAssignedDeveloperIdsAsync(
        Guid mentorId,
        CancellationToken cancellationToken)
    {
        if (_assignedByMentor.TryGetValue(mentorId, out var ids))
        {
            return Task.FromResult<IReadOnlyList<Guid>>(ids);
        }

        return Task.FromResult<IReadOnlyList<Guid>>([]);
    }

    public Task<IReadOnlyList<MentorContact>> GetActiveMentorsForDeveloperAsync(
        Guid developerId,
        CancellationToken cancellationToken)
    {
        if (_mentorsByDeveloper.TryGetValue(developerId, out var mentors))
        {
            return Task.FromResult<IReadOnlyList<MentorContact>>(mentors);
        }

        return Task.FromResult<IReadOnlyList<MentorContact>>([]);
    }

    public Task<Guid?> GetPrimaryMentorIdAsync(Guid developerId, CancellationToken cancellationToken) =>
        Task.FromResult(_primaryMentor.GetValueOrDefault(developerId));

    public Task<IReadOnlyDictionary<Guid, string>> GetDeveloperNamesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyDictionary<Guid, string>>(
            _developers.ToDictionary(pair => pair.Key, pair => pair.Value.Name));

    public Task<IReadOnlyDictionary<Guid, string>> GetProjectNamesAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyDictionary<Guid, string>>(new Dictionary<Guid, string>());
}
