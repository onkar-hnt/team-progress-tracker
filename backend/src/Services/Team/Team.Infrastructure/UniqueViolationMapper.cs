using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

using SharedKernel;

namespace Team.Infrastructure;

internal static class UniqueViolationMapper
{
    public static Exception? TryMap(DbUpdateException exception)
    {
        if (exception.InnerException is not SqlException sql || sql.Number is not (2601 or 2627))
        {
            return null;
        }

        var detail = (sql.Message + " " + (exception.Message ?? string.Empty)).ToLowerInvariant();

        if (detail.Contains("email"))
        {
            return new ConflictException("That email address is already on the roster.");
        }

        if (detail.Contains("employeeid"))
        {
            return new ConflictException("That employee id is already in use.");
        }

        if (detail.Contains("profileid"))
        {
            return new ConflictException("That login is already linked to someone on the roster.");
        }

        if (detail.Contains("code"))
        {
            return new ConflictException("That business code is already in use.");
        }

        if (detail.Contains("mentorid") && detail.Contains("developerid"))
        {
            return new ConflictException("That mentor is already assigned to this employee.");
        }

        return new ConflictException("That value is already in use.");
    }
}
