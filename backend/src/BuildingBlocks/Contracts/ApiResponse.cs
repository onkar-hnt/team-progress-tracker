namespace Contracts;

/// <summary>
/// The one response shape every endpoint uses, successful or not. Exactly
/// three properties at the top level — message, status and data — and the
/// status always equals the HTTP status code of the response carrying it.
/// <para>
/// Failures put their detail inside <c>data</c> as
/// <see cref="ApiErrorData"/> rather than adding a top-level property, and
/// never carry a stack trace or a database message.
/// </para>
/// </summary>
/// <typeparam name="T">What <c>data</c> holds on success.</typeparam>
public sealed record ApiResponse<T>
{
    /// <summary>A sentence a person can read. Always present.</summary>
    /// <example>Operation completed successfully.</example>
    public string Message { get; init; } = string.Empty;

    /// <summary>The HTTP status code of this response, repeated in the body.</summary>
    /// <example>200</example>
    public int Status { get; init; }

    /// <summary>The payload, or null when there is nothing to return.</summary>
    public T? Data { get; init; }

    public static ApiResponse<T> Ok(T data, string message = "Operation completed successfully.") =>
        new() { Message = message, Status = 200, Data = data };

    public static ApiResponse<T> Created(T data, string message = "Created successfully.") =>
        new() { Message = message, Status = 201, Data = data };
}

/// <summary>
/// The same shape for endpoints that return no payload, and for errors.
/// </summary>
public sealed record ApiResponse
{
    /// <example>Operation completed successfully.</example>
    public string Message { get; init; } = string.Empty;

    /// <example>200</example>
    public int Status { get; init; }

    /// <summary>
    /// Null for a plain success. On a validation failure this is an
    /// <see cref="ApiErrorData"/> listing what needs correcting.
    /// </summary>
    public object? Data { get; init; }

    public static ApiResponse Ok(string message = "Operation completed successfully.") =>
        new() { Message = message, Status = 200 };

    public static ApiResponse Failure(
        int status,
        string message,
        IReadOnlyList<string>? errors = null) => new()
        {
            Message = message,
            Status = status,
            Data = errors is { Count: > 0 } ? new ApiErrorData { Errors = errors } : null,
        };
}

/// <summary>
/// What <c>data</c> carries when a request was refused for more than one
/// reason, so every problem is reported at once instead of the first only.
/// </summary>
public sealed record ApiErrorData
{
    public IReadOnlyList<string> Errors { get; init; } = [];
}
