namespace Team.Application;

public sealed class MentorService(
    IRosterPersistence store,
    IAccessScopeProvider scopeProvider)
{
    public async Task<IReadOnlyList<MentorDto>> ListAsync(CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var rows = await store.ListMentorsAsync(cancellationToken);

        if (scope.IsPrivileged)
        {
            return [.. rows.OrderBy(row => row.Code).Select(RosterMapping.ToDto)];
        }

        if (scope.DeveloperId is not Guid developerId)
        {
            return [];
        }

        var mentorIds = await store.ListActiveMentorIdsForDeveloperAsync(developerId, cancellationToken);
        var allowed = mentorIds.ToHashSet();

        return [.. rows
            .Where(row => allowed.Contains(row.Id))
            .OrderBy(row => row.Code)
            .Select(RosterMapping.ToDto)];
    }

    public async Task<MentorDto> CreateAsync(
        SaveMentorRequest request,
        CancellationToken cancellationToken)
    {
        await DeveloperService.RequirePrivilegedAsync(scopeProvider, cancellationToken);

        var autoCode = string.IsNullOrWhiteSpace(request.Code);

        for (var attempt = 0; attempt < 3; attempt++)
        {
            var row = new Domain.Mentor();
            RequestApply.CreateMentor(request, row);

            row.Code = autoCode
                ? await store.AllocateMentorCodeAsync(cancellationToken)
                : request.Code!.Trim();

            if (row.CreatedDate is null)
            {
                row.CreatedDate = DateStrings.Today();
            }

            store.AddMentor(row);

            try
            {
                await store.SaveChangesAsync(cancellationToken);

                return RosterMapping.ToDto(row);
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

        throw new ConflictException("Could not assign a unique mentor code. Try again.");
    }

    public async Task<MentorDto> UpdateAsync(
        Guid id,
        UpdatePayload<SaveMentorRequest> payload,
        CancellationToken cancellationToken)
    {
        await DeveloperService.RequirePrivilegedAsync(scopeProvider, cancellationToken);

        var row = await store.FindMentorAsync(id, cancellationToken)
            ?? throw new NotFoundException("That mentor is no longer on the roster.");

        RequestApply.UpdateMentor(payload.Request, payload.Fields, row);
        await store.SaveChangesAsync(cancellationToken);

        return RosterMapping.ToDto(row);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        await DeveloperService.RequirePrivilegedAsync(scopeProvider, cancellationToken);

        var row = await store.FindMentorAsync(id, cancellationToken)
            ?? throw new NotFoundException("That mentor is no longer on the roster.");

        await store.EnsureMentorCanBeRemovedAsync(id, cancellationToken);
        store.RemoveMentor(row);
        await store.SaveChangesAsync(cancellationToken);
    }
}
