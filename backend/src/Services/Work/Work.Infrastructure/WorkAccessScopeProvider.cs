using Contracts;

using SharedKernel;

namespace Work.Infrastructure;

public sealed class WorkAccessScopeProvider(ITeamDirectory teamDirectory, ICurrentUser currentUser)
    : IAccessScopeProvider
{
    private AccessScope? _cached;

    public async Task<AccessScope> GetAsync(CancellationToken cancellationToken = default)
    {
        if (_cached is not null)
        {
            return _cached;
        }

        _cached = currentUser.Role switch
        {
            DomainRules.RoleAdmin => AccessScope.ForAdmin(currentUser.DeveloperId, currentUser.MentorId),
            DomainRules.RoleMentor => await BuildMentorScopeAsync(cancellationToken),
            _ => BuildDeveloperScope(),
        };

        return _cached;
    }

    private async Task<AccessScope> BuildMentorScopeAsync(CancellationToken cancellationToken)
    {
        var visible = new HashSet<Guid>();

        if (currentUser.MentorId is Guid mentorId)
        {
            var assigned = await teamDirectory.GetAssignedDeveloperIdsAsync(mentorId, cancellationToken);

            foreach (var developerId in assigned)
            {
                visible.Add(developerId);
            }
        }

        if (currentUser.DeveloperId is Guid ownDeveloperId)
        {
            visible.Add(ownDeveloperId);
        }

        return new AccessScope(
            DomainRules.RoleMentor,
            currentUser.DeveloperId,
            currentUser.MentorId,
            visible);
    }

    private AccessScope BuildDeveloperScope()
    {
        IReadOnlySet<Guid>? visible = currentUser.DeveloperId is Guid developerId
            ? new HashSet<Guid> { developerId }
            : [];

        return new AccessScope(
            DomainRules.RoleDeveloper,
            currentUser.DeveloperId,
            currentUser.MentorId,
            visible);
    }
}
