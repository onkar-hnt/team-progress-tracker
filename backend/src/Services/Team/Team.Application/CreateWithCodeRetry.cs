namespace Team.Application;

internal static class CreateWithCodeRetry
{
    public static bool IsBusinessCodeConflict(ConflictException exception) =>
        exception.Message.Contains("business code", StringComparison.OrdinalIgnoreCase);
}
