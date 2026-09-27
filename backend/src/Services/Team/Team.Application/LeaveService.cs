namespace Team.Application;

/// <summary>
/// Days accounted for as leave, which is why no daily update exists for them.
/// </summary>
/// <remarks>
/// Reading follows the daily update rules: your own, anything for an
/// administrator, and the assigned employees for a mentor. Unlike an update, a
/// leave day names no project, so there is no project boundary to apply — which
/// is correct rather than convenient. A day off is not work on one project.
/// </remarks>
public sealed class LeaveService(
    IRosterPersistence store,
    IAccessScopeProvider scopeProvider,
    ICurrentUser currentUser)
{
    public async Task<IReadOnlyList<LeaveDayDto>> ListAsync(
        LeaveDayQuery query,
        CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);
        var developerIds = scope.RestrictDeveloperIds(query.DeveloperIds);

        if (developerIds is { Count: 0 })
        {
            return [];
        }

        var rows = await store.ListLeaveDaysAsync(
            DateStrings.ParseOptionalDate(query.DateFrom, "Date from"),
            DateStrings.ParseOptionalDate(query.DateTo, "Date to"),
            developerIds,
            cancellationToken);

        return [.. rows.Select(RosterMapping.ToDto)];
    }

    public async Task<LeaveDayDto> CreateAsync(
        SaveLeaveDayRequest request,
        CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        LeaveDayRules.RequireCanWriteFor(scope, request.DeveloperId);

        var date = DateStrings.ParseDate(request.Date, "Date");
        LeaveDayRules.RequireWithinReach(date, DateStrings.Today());

        if (!await store.DeveloperExistsAsync(request.DeveloperId, cancellationToken))
        {
            throw new NotFoundException("That employee is no longer on the roster.");
        }

        if (await store.LeaveDayExistsAsync(request.DeveloperId, date, cancellationToken))
        {
            throw new ConflictException("That day is already accounted for as leave.");
        }

        var row = new Domain.LeaveDay
        {
            DeveloperId = request.DeveloperId,
            LeaveDate = date,
            Note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim(),

            // Taken from the token, never from the body, so the record of who
            // said so stays honest even when an administrator marks the day.
            RecordedBy = currentUser.IsAuthenticated ? currentUser.ProfileId : null,
        };

        store.AddLeaveDay(row);
        await store.SaveChangesAsync(cancellationToken);

        return RosterMapping.ToDto(row);
    }

    /// <summary>
    /// Removes the row, rather than putting it aside. Marking the wrong day has
    /// to be undoable by whoever marked it, and the undo is the removal: the
    /// row says nothing else.
    /// </summary>
    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        var row = await store.FindLeaveDayAsync(id, cancellationToken)
            ?? throw new NotFoundException("That leave day is no longer recorded.");

        LeaveDayRules.RequireCanWriteFor(scope, row.DeveloperId);

        store.RemoveLeaveDay(row);
        await store.SaveChangesAsync(cancellationToken);
    }
}
