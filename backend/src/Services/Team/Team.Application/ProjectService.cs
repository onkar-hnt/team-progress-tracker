namespace Team.Application;

public sealed class ProjectService(
    IRosterPersistence store,
    IAccessScopeProvider scopeProvider,
    IClock clock)
{
    public async Task<IReadOnlyList<ProjectDto>> ListAsync(CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var rows = await store.ListProjectsAsync(cancellationToken);
        var members = await store.GetAllProjectMembersAsync(cancellationToken);

        if (scope.IsPrivileged)
        {
            return [.. rows
                .OrderBy(row => row.Code)
                .Select(row => RosterMapping.ToDto(row, MemberIds(members, row.Id)))];
        }

        if (scope.DeveloperId is not Guid developerId)
        {
            return [];
        }

        var memberProjectIds = (await store.ListDeveloperProjectIdsAsync(developerId, cancellationToken))
            .ToHashSet();

        var mentorIds = (await store.ListActiveMentorIdsForDeveloperAsync(developerId, cancellationToken))
            .ToHashSet();

        return [.. rows
            .Where(row => memberProjectIds.Contains(row.Id)
                || (row.MentorId is Guid mentorId && mentorIds.Contains(mentorId)))
            .OrderBy(row => row.Code)
            .Select(row => RosterMapping.ToDto(row, MemberIds(members, row.Id)))];
    }

    public async Task<ProjectDto> CreateAsync(
        SaveProjectRequest request,
        CancellationToken cancellationToken)
    {
        await DeveloperService.RequirePrivilegedAsync(scopeProvider, cancellationToken);
        await ValidateReferencesAsync(request.MentorId, request.AssignedDeveloperIds, cancellationToken);

        var autoCode = string.IsNullOrWhiteSpace(request.Code);
        Domain.Project? saved = null;

        for (var attempt = 0; attempt < 3; attempt++)
        {
            var row = new Domain.Project();
            RequestApply.CreateProject(request, row);

            row.Code = autoCode
                ? await store.AllocateProjectCodeAsync(cancellationToken)
                : request.Code!.Trim();

            store.AddProject(row);

            try
            {
                await store.SaveChangesAsync(cancellationToken);
                saved = row;
                break;
            }
            catch (ConflictException exception) when (autoCode && CreateWithCodeRetry.IsBusinessCodeConflict(exception))
            {
                store.Detach(row);

                if (attempt == 2)
                {
                    throw;
                }
            }
        }

        if (saved is null)
        {
            throw new ConflictException("Could not assign a unique project code. Try again.");
        }

        var memberIds = request.AssignedDeveloperIds ?? [];

        if (memberIds.Count > 0)
        {
            await store.ReplaceProjectMembersAsync(saved.Id, memberIds, clock.Now, cancellationToken);
            await store.SaveChangesAsync(cancellationToken);
        }

        return RosterMapping.ToDto(saved, [.. memberIds]);
    }

    public async Task<ProjectDto> UpdateAsync(
        Guid id,
        UpdatePayload<SaveProjectRequest> payload,
        CancellationToken cancellationToken)
    {
        await DeveloperService.RequirePrivilegedAsync(scopeProvider, cancellationToken);

        var row = await store.FindProjectAsync(id, cancellationToken)
            ?? throw new NotFoundException("That project is no longer on the roster.");

        if (payload.Fields.Has("mentorId"))
        {
            await ValidateReferencesAsync(payload.Request.MentorId, null, cancellationToken);
        }

        if (payload.Fields.Has("assignedDeveloperIds") && payload.Request.AssignedDeveloperIds is not null)
        {
            await ValidateReferencesAsync(null, payload.Request.AssignedDeveloperIds, cancellationToken);
        }

        RequestApply.UpdateProject(payload.Request, payload.Fields, row);
        await store.SaveChangesAsync(cancellationToken);

        if (payload.Fields.Has("assignedDeveloperIds") && payload.Request.AssignedDeveloperIds is not null)
        {
            await store.ReplaceProjectMembersAsync(
                id,
                payload.Request.AssignedDeveloperIds,
                clock.Now,
                cancellationToken);
            await store.SaveChangesAsync(cancellationToken);
        }

        var memberIds = await store.GetProjectMemberIdsAsync(id, cancellationToken);

        return RosterMapping.ToDto(row, memberIds);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        await DeveloperService.RequirePrivilegedAsync(scopeProvider, cancellationToken);

        var row = await store.FindProjectAsync(id, cancellationToken)
            ?? throw new NotFoundException("That project is no longer on the roster.");

        await store.EnsureProjectCanBeRemovedAsync(id, cancellationToken);
        store.RemoveProject(row);
        await store.SaveChangesAsync(cancellationToken);
    }

    private async Task ValidateReferencesAsync(
        Guid? mentorId,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken)
    {
        if (mentorId is Guid id && !await store.MentorExistsAsync(id, cancellationToken))
        {
            throw new ValidationFailedException("Choose a mentor that exists.");
        }

        if (developerIds is not null
            && developerIds.Count > 0
            && !await store.AllDevelopersExistAsync(developerIds, cancellationToken))
        {
            throw new ValidationFailedException("One or more chosen employees do not exist.");
        }
    }

    private static IReadOnlyList<Guid> MemberIds(
        IReadOnlyDictionary<Guid, IReadOnlyList<Guid>> members,
        Guid projectId) =>
        members.TryGetValue(projectId, out var ids) ? ids : [];
}
