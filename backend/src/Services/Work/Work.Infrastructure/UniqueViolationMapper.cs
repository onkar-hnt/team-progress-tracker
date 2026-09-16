using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

using SharedKernel;

namespace Work.Infrastructure;

internal static class UniqueViolationMapper
{
    public static Exception? TryMap(DbUpdateException exception)
    {
        if (exception.InnerException is not SqlException sql || sql.Number is not (2601 or 2627))
        {
            return null;
        }

        var detail = (sql.Message + " " + (exception.Message ?? string.Empty)).ToLowerInvariant();

        if (detail.Contains("code"))
        {
            return new ConflictException("That business code is already in use.");
        }

        return new ConflictException("That value is already in use.");
    }
}
