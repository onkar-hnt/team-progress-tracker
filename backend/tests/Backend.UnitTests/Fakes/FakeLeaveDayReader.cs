using Reporting.Application;

namespace Backend.UnitTests.Fakes;

internal sealed class FakeLeaveDayReader(params LeaveDayRow[] rows) : ILeaveDayReader
{
    public Task<IReadOnlyList<LeaveDayRow>> ListAsync(
        DateOnly from,
        DateOnly to,
        IReadOnlyList<Guid>? developerIds,
        CancellationToken cancellationToken = default)
    {
        var filtered = rows.Where(row =>
            row.LeaveDate >= from
            && row.LeaveDate <= to
            && (developerIds is null || developerIds.Contains(row.DeveloperId)));

        return Task.FromResult<IReadOnlyList<LeaveDayRow>>([.. filtered]);
    }
}
