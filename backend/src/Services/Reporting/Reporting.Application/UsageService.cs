using Contracts;

using SharedKernel;

namespace Reporting.Application;

public sealed class UsageService(IUsageReader reader, IClock clock)
{
    public async Task<ResourceUsageDto> GetUsageAsync(CancellationToken cancellationToken = default) =>
        await reader.ReadAsync(clock.Now, cancellationToken);
}
