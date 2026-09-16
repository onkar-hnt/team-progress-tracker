using Microsoft.EntityFrameworkCore;

namespace Work.Infrastructure;

public sealed class WorkBusinessCodeAllocator(WorkDbContext context)
{
    public Task<string> NextTaskCodeAsync(CancellationToken cancellationToken) =>
        NextAsync(context.Tasks.Select(row => row.Code), "TSK", cancellationToken);

    public Task<string> NextCommentCodeAsync(CancellationToken cancellationToken) =>
        NextAsync(context.Feedback.Select(row => row.Code), "CMT", cancellationToken);

    private static async Task<string> NextAsync(
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
