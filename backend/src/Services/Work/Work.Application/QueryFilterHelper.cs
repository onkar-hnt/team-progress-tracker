namespace Work.Application;

public static class QueryFilterHelper
{
    public static bool IsExplicitEmptyGuids(IReadOnlyList<Guid>? values) =>
        values is not null && values.Count == 0;

    public static bool IsExplicitEmptyStrings(IReadOnlyList<string>? values) =>
        values is not null && values.Count == 0;
}
