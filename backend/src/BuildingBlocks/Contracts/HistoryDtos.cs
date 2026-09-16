namespace Contracts;

public sealed record FieldChangeDto
{
    public required string Field { get; init; }
    public string? Before { get; init; }
    public string? After { get; init; }
}

/// <summary>
/// One line of the change log. Written as things happen and never edited,
/// including by the person who made the change.
/// </summary>
public sealed record ChangeRecordDto
{
    public required Guid Id { get; init; }

    /// <summary>The table, which the frontend calls the record kind.</summary>
    public required string TableName { get; init; }

    public required Guid RecordId { get; init; }
    public required string Action { get; init; }
    public required string Subject { get; init; }
    public Guid? SubjectDeveloperId { get; init; }
    public Guid? ChangedBy { get; init; }
    public required string ChangedByName { get; init; }
    public required string ChangedAt { get; init; }
    public IReadOnlyList<FieldChangeDto> Changes { get; init; } = [];
}

/// <summary>A row in the bin, whatever kind of record it is.</summary>
public sealed record DeletedRecordDto
{
    public required string Kind { get; init; }
    public required Guid Id { get; init; }

    /// <summary>What the row is called: a task name, an entry title, a comment.</summary>
    public required string Title { get; init; }

    public required string DeletedAt { get; init; }
    public Guid? DeletedBy { get; init; }

    /// <summary>The date the record itself is about, where it has one.</summary>
    public string? Date { get; init; }

    public Guid? DeveloperId { get; init; }
    public Guid? ProjectId { get; init; }

    /// <summary>The mentor a deleted comment is attributed to, for the bin's rules.</summary>
    public Guid? AuthorMentorId { get; init; }
}
