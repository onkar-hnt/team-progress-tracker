namespace Contracts;

/// <summary>
/// A PUT body together with the set of JSON keys that were present, so handlers
/// can apply only those fields and leave the rest of the row unchanged.
/// </summary>
public sealed record UpdatePayload<TRequest>(TRequest Request, JsonFieldSet Fields);
