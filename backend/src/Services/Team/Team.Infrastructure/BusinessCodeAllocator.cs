using Microsoft.EntityFrameworkCore;

namespace Team.Infrastructure;

/// <summary>
/// Hands out DEV/MEN/PRJ codes by scanning the current maximum suffix in the
/// same transaction as the insert. Postgres used sequences; retrying on a unique
/// violation covers the rare race when two rows allocate the same next number.
/// </summary>
public sealed class BusinessCodeAllocator(TeamDbContext context)
{
    public Task<string> NextDeveloperCodeAsync(CancellationToken cancellationToken) =>
        NextAsync(context.Developers.Select(row => row.Code), "DEV", cancellationToken);

    public Task<string> NextMentorCodeAsync(CancellationToken cancellationToken) =>
        NextAsync(context.Mentors.Select(row => row.Code), "MEN", cancellationToken);

    public Task<string> NextProjectCodeAsync(CancellationToken cancellationToken) =>
        NextAsync(context.Projects.Select(row => row.Code), "PRJ", cancellationToken);

    private async Task<string> NextAsync(
        IQueryable<string> codes,
        string prefix,
        CancellationToken cancellationToken)
    {
        var existing = await codes
            .Where(code => code.StartsWith(prefix))
            .ToListAsync(cancellationToken);

        var maxSuffix = 0;

        foreach (var code in existing)
        {
            if (code.Length <= prefix.Length)
            {
                continue;
            }

            if (int.TryParse(code[prefix.Length..], out var suffix) && suffix > maxSuffix)
            {
                maxSuffix = suffix;
            }
        }

        var next = maxSuffix + 1;

        return next < 1000
            ? prefix + next.ToString("D3", System.Globalization.CultureInfo.InvariantCulture)
            : prefix + next.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }
}
