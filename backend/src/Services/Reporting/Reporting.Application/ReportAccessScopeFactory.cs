using Contracts;

using SharedKernel;

namespace Reporting.Application;

/// <summary>
/// Team's IAccessScopeProvider is not referenced here, so scope is rebuilt from
/// the token claims and ITeamDirectory the same way access-scope.ts describes.
/// </summary>
public sealed class ReportAccessScopeFactory(ICurrentUser currentUser, ITeamDirectory teamDirectory)
{
    public async Task<AccessScope> CreateAsync(CancellationToken cancellationToken = default)
    {
        if (currentUser.Role == DomainRules.RoleAdmin)
        {
            return AccessScope.ForAdmin(currentUser.DeveloperId, currentUser.MentorId);
        }

        if (currentUser.Role == DomainRules.RoleMentor)
        {
            if (currentUser.MentorId is null)
            {
                throw new ForbiddenException("Your login is not linked to a mentor record.");
            }

            var visible = (await teamDirectory.GetAssignedDeveloperIdsAsync(
                currentUser.MentorId.Value,
                cancellationToken)).ToHashSet();

            if (currentUser.DeveloperId is Guid ownDeveloperId)
            {
                visible.Add(ownDeveloperId);
            }

            return new AccessScope(
                currentUser.Role,
                currentUser.DeveloperId,
                currentUser.MentorId,
                visible);
        }

        if (currentUser.DeveloperId is null)
        {
            throw new ForbiddenException("Your login is not linked to a developer record.");
        }

        return new AccessScope(
            currentUser.Role,
            currentUser.DeveloperId,
            currentUser.MentorId,
            new HashSet<Guid> { currentUser.DeveloperId.Value });
    }
}
