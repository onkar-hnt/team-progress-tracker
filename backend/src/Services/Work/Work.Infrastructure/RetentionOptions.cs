namespace Work.Infrastructure;

public sealed class RetentionOptions
{
    public const string Section = "Retention";

    public int IntervalHours { get; set; } = 6;

    public int HistoryBatchSize { get; set; } = 500;

    public int DeletionBatchSize { get; set; } = 500;
}
