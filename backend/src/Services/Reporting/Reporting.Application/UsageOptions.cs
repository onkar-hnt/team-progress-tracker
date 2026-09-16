namespace Reporting.Application;

public sealed class UsageOptions
{
    public const string Section = "Usage";

    /// <summary>SQL Server Express per-database data file limit (ten gigabytes).</summary>
    public long MaxDatabaseBytes { get; init; } = 10_737_418_240;
}
