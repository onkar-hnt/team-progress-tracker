namespace SharedKernel;

/// <summary>
/// Thrown by domain and application code to say what went wrong in terms the
/// API layer can turn into a status code, so no controller needs a try/catch.
/// </summary>
public abstract class AppException(string message, IReadOnlyList<string>? errors = null)
    : Exception(message)
{
    public IReadOnlyList<string> Errors { get; } = errors ?? [];
}

public sealed class NotFoundException(string message) : AppException(message);

public sealed class ValidationFailedException(string message, IReadOnlyList<string>? errors = null)
    : AppException(message, errors);

/// <summary>Signed in, but not permitted. Answered with 403.</summary>
public sealed class ForbiddenException(string message = "You are not allowed to do that.")
    : AppException(message);

/// <summary>Not signed in, or the session no longer resolves. Answered with 401.</summary>
public sealed class UnauthenticatedException(string message = "Please sign in again.")
    : AppException(message);

/// <summary>A duplicate, or a row something else still depends on. Answered with 409.</summary>
public sealed class ConflictException(string message) : AppException(message);
