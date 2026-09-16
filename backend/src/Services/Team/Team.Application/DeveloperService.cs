namespace Team.Application;

public sealed class DeveloperService(
    IRosterPersistence store,
    IAccessScopeProvider scopeProvider)
{
    public async Task<IReadOnlyList<DeveloperDto>> ListAsync(CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var rows = await store.ListDevelopersAsync(cancellationToken);

        // Mentors read the roster as well as admins: they manage employees,
        // mentors and assignments, which needs the list of people who are not
        // assigned to them yet. Work, feedback and reports stay scoped.
        if (scope.IsPrivileged)
        {
            return [.. rows.OrderBy(row => row.Code).Select(RosterMapping.ToDto)];
        }

        return [.. rows
            .Where(row => scope.CanViewDeveloper(row.Id))
            .OrderBy(row => row.Code)
            .Select(RosterMapping.ToDto)];
    }

    public async Task<DeveloperDto> CreateAsync(
        SaveDeveloperRequest request,
        CancellationToken cancellationToken)
    {
        await RequirePrivilegedAsync(scopeProvider, cancellationToken);

        if (request.PrimaryProjectId is Guid projectId
            && !await store.ProjectExistsAsync(projectId, cancellationToken))
        {
            throw new ValidationFailedException("Choose a project that exists.");
        }

        var autoCode = string.IsNullOrWhiteSpace(request.Code);

        for (var attempt = 0; attempt < 3; attempt++)
        {
            var row = new Domain.Developer();
            RequestApply.CreateDeveloper(request, row);

            row.Code = autoCode
                ? await store.AllocateDeveloperCodeAsync(cancellationToken)
                : request.Code!.Trim();

            if (row.CreatedDate is null)
            {
                row.CreatedDate = DateStrings.Today();
            }

            store.AddDeveloper(row);

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

        throw new ConflictException("Could not assign a unique employee code. Try again.");
    }

    public async Task<DeveloperDto> UpdateAsync(
        Guid id,
        UpdatePayload<SaveDeveloperRequest> payload,
        CancellationToken cancellationToken)
    {
        await RequirePrivilegedAsync(scopeProvider, cancellationToken);

        var row = await store.FindDeveloperAsync(id, cancellationToken)
            ?? throw new NotFoundException("That employee is no longer on the roster.");

        if (payload.Fields.Has("primaryProjectId")
            && payload.Request.PrimaryProjectId is Guid projectId
            && !await store.ProjectExistsAsync(projectId, cancellationToken))
        {
            throw new ValidationFailedException("Choose a project that exists.");
        }

        RequestApply.UpdateDeveloper(payload.Request, payload.Fields, row);
        await store.SaveChangesAsync(cancellationToken);

        return RosterMapping.ToDto(row);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        await RequirePrivilegedAsync(scopeProvider, cancellationToken);

        var row = await store.FindDeveloperAsync(id, cancellationToken)
            ?? throw new NotFoundException("That employee is no longer on the roster.");

        await store.EnsureDeveloperCanBeRemovedAsync(id, cancellationToken);
        store.RemoveDeveloper(row);
        await store.SaveChangesAsync(cancellationToken);
    }

    internal static async Task RequirePrivilegedAsync(
        IAccessScopeProvider scopeProvider,
        CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (!scope.IsPrivileged)
        {
            throw new ForbiddenException();
        }
    }
}
