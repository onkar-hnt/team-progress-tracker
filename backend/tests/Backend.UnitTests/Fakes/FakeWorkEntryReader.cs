using Reporting.Application;

namespace Backend.UnitTests.Fakes;

/// <summary>
/// Applies the range, project and developer filters the SQL reader applies, so
/// a test can hand it every row and still see what Reporting would see.
/// </summary>
internal sealed class FakeWorkEntryReader(IReadOnlyList<WorkEntryRow> rows) : IWorkEntryReader
{
    public Task<IReadOnlyList<WorkEntryRow>> ListAsync(
        DateOnly from,
        DateOnly to,
        Guid? projectId,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken = default)
    {
        var filtered = rows.Where(entry =>
            entry.EntryDate >= from
            && entry.EntryDate <= to
            && (projectId is null || entry.ProjectId == projectId)
            && (developerIds is null || developerIds.Contains(entry.DeveloperId)));

        return Task.FromResult<IReadOnlyList<WorkEntryRow>>([.. filtered]);
    }
}
