namespace Contracts;

/// <summary>
/// Database footprint and account counts for the admin Usage screen.
/// </summary>
public sealed record ResourceUsageDto
{
    /// <summary>When the figures were read from SQL Server, in UTC.</summary>
    public required DateTimeOffset MeasuredAt { get; init; }

    /// <summary>Combined size of data files for this database.</summary>
    public long DatabaseBytes { get; init; }

    /// <summary>Combined size of transaction log files for this database.</summary>
    public long LogBytes { get; init; }

    /// <summary>
    /// Per-database ceiling the Usage screen compares against (SQL Server Express
    /// default is ten gigabytes).
    /// </summary>
    public long MaxDatabaseBytes { get; init; }

    /// <summary>Application tables in the four service schemas, largest first.</summary>
    public IReadOnlyList<TableUsageDto> Tables { get; init; } = [];

    /// <summary>Rows in identity.Profiles.</summary>
    public int Accounts { get; init; }

    /// <summary>
    /// Profiles whose <c>Status</c> is <see cref="SharedKernel.DomainRules.ProfileActive"/>.
    /// There is no last-sign-in column in this schema.
    /// </summary>
    public int ActiveAccounts { get; init; }

    /// <summary>
    /// The latest <c>UpdatedAt</c> across application tables, or null when nothing
    /// has been written yet.
    /// </summary>
    public DateTimeOffset? LastWriteAt { get; init; }
}

public sealed record TableUsageDto
{
    /// <summary>Schema-qualified name, such as work.DailyUpdates.</summary>
    public required string Name { get; init; }

    public long Rows { get; init; }

    public long TotalBytes { get; init; }

    public long IndexBytes { get; init; }
}
