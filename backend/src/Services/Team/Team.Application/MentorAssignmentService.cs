namespace Team.Application;

public sealed class MentorAssignmentService(
    IRosterPersistence store,
    IAccessScopeProvider scopeProvider,
    ICurrentUser currentUser)
{
    public async Task<IReadOnlyList<MentorAssignmentDto>> ListAsync(CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var rows = await store.ListMentorAssignmentsAsync(cancellationToken);

        if (scope.IsAdmin)
        {
            return [.. rows.Select(RosterMapping.ToDto)];
        }

        if (scope.IsMentor && currentUser.MentorId is Guid mentorId)
        {
            return [.. rows.Where(row => row.MentorId == mentorId).Select(RosterMapping.ToDto)];
        }

        if (scope.DeveloperId is Guid developerId)
        {
            return [.. rows.Where(row => row.DeveloperId == developerId).Select(RosterMapping.ToDto)];
        }

        return [];
    }

    public async Task<IReadOnlyList<MentorAssignmentDto>> SetForMentorAsync(
        Guid mentorId,
        SetMentorAssignmentsRequest request,
        CancellationToken cancellationToken)
    {
        await RequireCanManageMentorAsync(mentorId, cancellationToken);

        if (!await store.MentorExistsAsync(mentorId, cancellationToken))
        {
            throw new NotFoundException("That mentor is no longer on the roster.");
        }

        var developerIds = request.DeveloperIds.Distinct().ToList();

        if (developerIds.Count > 0 && !await store.AllDevelopersExistAsync(developerIds, cancellationToken))
        {
            throw new ValidationFailedException("One or more chosen employees do not exist.");
        }

        var assignedDate = DateStrings.ParseOptionalDate(request.AssignedDate, "Assigned date")
            ?? DateStrings.Today();

        var desired = developerIds.ToHashSet();
        var existing = await store.ListMentorAssignmentsForMentorAsync(mentorId, cancellationToken);

        foreach (var row in existing)
        {
            if (desired.Contains(row.DeveloperId))
            {
                if (!row.Active)
                {
                    row.Active = true;
                    row.AssignedDate ??= assignedDate;
                }
            }
            else
            {
                store.RemoveMentorAssignment(row);
            }
        }

        var existingDeveloperIds = existing.Select(row => row.DeveloperId).ToHashSet();

        foreach (var developerId in desired.Where(id => !existingDeveloperIds.Contains(id)))
        {
            store.AddMentorAssignment(new Domain.MentorAssignment
            {
                MentorId = mentorId,
                DeveloperId = developerId,
                AssignedDate = assignedDate,
                Active = true,
            });
        }

        await store.SaveChangesAsync(cancellationToken);

        var updated = await store.ListMentorAssignmentsForMentorAsync(mentorId, cancellationToken);

        return [.. updated.Select(RosterMapping.ToDto)];
    }

    private async Task RequireCanManageMentorAsync(Guid mentorId, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (scope.IsAdmin)
        {
            return;
        }

        if (scope.IsMentor && currentUser.MentorId == mentorId)
        {
            return;
        }

        throw new ForbiddenException("You can only change assignments for your own mentor profile.");
    }
}
