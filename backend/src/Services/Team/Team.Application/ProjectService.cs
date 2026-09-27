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
        var mentors = await store.GetAllProjectMentorsAsync(cancellationToken);

        if (scope.IsAdmin)
        {
            return Dtos(rows, members, mentors);
        }

        var memberProjectIds = scope.DeveloperId is Guid ownDeveloperId
            ? (await store.ListDeveloperProjectIdsAsync(ownDeveloperId, cancellationToken)).ToHashSet()
            : [];

        if (scope.IsMentor)
        {
            // Being privileged no longer opens every project. A mentor reads the
            // projects they are responsible for, a project nobody is responsible
            // for yet so it can be given an owner, and anything they belong to as
            // an employee in their own right.
            return Dtos(
                rows.Where(row =>
                    scope.CanRequestProject(row.Id)
                    || memberProjectIds.Contains(row.Id)
                    || ResponsibleMentorIds(row, mentors).Count == 0),
                members,
                mentors);
        }

        if (scope.DeveloperId is not Guid developerId)
        {
            return [];
        }

        var ownMentorIds = (await store.ListActiveMentorIdsForDeveloperAsync(developerId, cancellationToken))
            .ToHashSet();

        return Dtos(
            rows.Where(row => memberProjectIds.Contains(row.Id)
                || ResponsibleMentorIds(row, mentors).Any(ownMentorIds.Contains)),
            members,
            mentors);
    }

    /// <summary>
    /// The projects the caller is responsible for as a mentor. Empty for
    /// anyone else, including an administrator, who is not narrowed by project.
    /// </summary>
    public async Task<IReadOnlyList<Guid>> ListResponsibleProjectIdsAsync(
        CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        return scope.VisibleProjectIds is null ? [] : [.. scope.VisibleProjectIds];
    }

    public async Task<ProjectDto> CreateAsync(
        SaveProjectRequest request,
        CancellationToken cancellationToken)
    {
        await DeveloperService.RequirePrivilegedAsync(scopeProvider, cancellationToken);
        await ValidateReferencesAsync(
            request.MentorId,
            request.MentorIds,
            request.AssignedDeveloperIds,
            cancellationToken);

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

        var scope = await scopeProvider.GetAsync(cancellationToken);
        var mentorIds = ProjectMentorSynchronizer.ForCreate(
            request.MentorIds,
            saved.MentorId,
            scope.MentorId);

        if (mentorIds.Count > 0)
        {
            await store.ReplaceProjectMentorsAsync(saved.Id, mentorIds, clock.Now, cancellationToken);
            await store.SaveChangesAsync(cancellationToken);
        }

        return RosterMapping.ToDto(saved, [.. memberIds], mentorIds);
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
            await ValidateReferencesAsync(payload.Request.MentorId, null, null, cancellationToken);
        }

        var sendsMentors = payload.Fields.Has("mentorIds") && payload.Request.MentorIds is not null;

        if (sendsMentors)
        {
            await ValidateReferencesAsync(null, payload.Request.MentorIds, null, cancellationToken);
        }

        if (payload.Fields.Has("assignedDeveloperIds") && payload.Request.AssignedDeveloperIds is not null)
        {
            await ValidateReferencesAsync(null, null, payload.Request.AssignedDeveloperIds, cancellationToken);
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

        // A changed primary mentor has to join the set even when the caller said
        // nothing about mentorIds, so the stored set is rebuilt either way.
        if (sendsMentors || payload.Fields.Has("mentorId"))
        {
            var basis = sendsMentors
                ? payload.Request.MentorIds!
                : await store.GetProjectMentorIdsAsync(id, cancellationToken);

            await store.ReplaceProjectMentorsAsync(
                id,
                ProjectMentorSynchronizer.ForUpdate(basis, row.MentorId),
                clock.Now,
                cancellationToken);
            await store.SaveChangesAsync(cancellationToken);
        }

        var memberIds = await store.GetProjectMemberIdsAsync(id, cancellationToken);
        var mentorIds = await store.GetProjectMentorIdsAsync(id, cancellationToken);

        return RosterMapping.ToDto(row, memberIds, mentorIds);
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
        IReadOnlyList<Guid>? mentorIds,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken)
    {
        if (mentorId is Guid id && !await store.MentorExistsAsync(id, cancellationToken))
        {
            throw new ValidationFailedException("Choose a mentor that exists.");
        }

        if (mentorIds is not null
            && mentorIds.Count > 0
            && !await store.AllMentorsExistAsync(mentorIds, cancellationToken))
        {
            throw new ValidationFailedException("One or more chosen mentors do not exist.");
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

    private static IReadOnlyList<Guid> ResponsibleMentorIds(
        Domain.Project row,
        IReadOnlyDictionary<Guid, IReadOnlyList<Guid>> mentors) =>
        RosterMapping.ResponsibleMentorIds(row, MemberIds(mentors, row.Id));

    private static IReadOnlyList<ProjectDto> Dtos(
        IEnumerable<Domain.Project> rows,
        IReadOnlyDictionary<Guid, IReadOnlyList<Guid>> members,
        IReadOnlyDictionary<Guid, IReadOnlyList<Guid>> mentors) =>
        [.. rows
            .OrderBy(row => row.Code)
            .Select(row => RosterMapping.ToDto(row, MemberIds(members, row.Id), MemberIds(mentors, row.Id)))];
}
