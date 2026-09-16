namespace SharedKernel;

/// <summary>
/// Who the caller is, taken from the validated token rather than anything the
/// request body claims.
/// </summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    /// <summary>The profile id, which is also the identity user id.</summary>
    Guid ProfileId { get; }

    string Email { get; }
    string Role { get; }

    /// <summary>Set when this login is linked to a row on the employee roster.</summary>
    Guid? DeveloperId { get; }

    /// <summary>Set when this login is linked to a mentor row.</summary>
    Guid? MentorId { get; }
}

/// <summary>
/// What the caller may see, which used to be row level security. Postgres
/// applied these rules inside the database; SQL Server has no equivalent, so
/// every query that reads work must be filtered through this instead. The rules
/// match src/services/auth/access-scope.ts so the two agree about scope.
/// </summary>
/// <remarks>
/// VisibleDeveloperIds null means unrestricted; empty means nothing is visible.
/// </remarks>
public sealed record AccessScope(
    string Role,
    Guid? DeveloperId,
    Guid? MentorId,
    IReadOnlySet<Guid>? VisibleDeveloperIds)
{
    public bool IsAdmin => Role == DomainRules.RoleAdmin;
    public bool IsMentor => Role == DomainRules.RoleMentor;
    public bool IsPrivileged => IsAdmin || IsMentor;
    public bool IsUnrestricted => VisibleDeveloperIds is null;

    public static AccessScope ForAdmin(Guid? developerId, Guid? mentorId) =>
        new(DomainRules.RoleAdmin, developerId, mentorId, null);

    public bool CanViewDeveloper(Guid developerId) =>
        VisibleDeveloperIds is null || VisibleDeveloperIds.Contains(developerId);

    public void RequireDeveloperVisible(Guid developerId)
    {
        if (!CanViewDeveloper(developerId))
        {
            throw new ForbiddenException("That employee is outside the people you can see.");
        }
    }

    /// <summary>
    /// Narrows a requested developer filter to what the caller may read. Null
    /// out means no filter at all; an empty list means the answer is empty
    /// without going to the database.
    /// </summary>
    public IReadOnlyList<Guid>? RestrictDeveloperIds(IReadOnlyCollection<Guid>? requested)
    {
        if (VisibleDeveloperIds is null)
        {
            return requested is null || requested.Count == 0 ? null : [.. requested];
        }

        if (requested is null || requested.Count == 0)
        {
            return [.. VisibleDeveloperIds];
        }

        return [.. requested.Where(VisibleDeveloperIds.Contains)];
    }
}

/// <summary>
/// Builds the scope for the current request. Mentors need their assignment list
/// read before anything else can be answered, so this is resolved once and
/// cached for the request rather than per query.
/// </summary>
public interface IAccessScopeProvider
{
    Task<AccessScope> GetAsync(CancellationToken cancellationToken = default);
}
