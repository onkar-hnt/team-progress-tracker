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
/// Either visible set being null means unrestricted; empty means nothing is
/// visible. Project scope defaults to unrestricted so that only the callers
/// that know a mentor's projects have to say anything about them.
/// </remarks>
public sealed record AccessScope(
    string Role,
    Guid? DeveloperId,
    Guid? MentorId,
    IReadOnlySet<Guid>? VisibleDeveloperIds,
    IReadOnlySet<Guid>? VisibleProjectIds = null)
{
    public bool IsAdmin => Role == DomainRules.RoleAdmin;
    public bool IsMentor => Role == DomainRules.RoleMentor;
    public bool IsPrivileged => IsAdmin || IsMentor;
    public bool IsUnrestricted => VisibleDeveloperIds is null;
    public bool ReadsEveryProject => VisibleProjectIds is null;

    public static AccessScope ForAdmin(Guid? developerId, Guid? mentorId) =>
        new(DomainRules.RoleAdmin, developerId, mentorId, null, null);

    public bool CanViewDeveloper(Guid developerId) =>
        VisibleDeveloperIds is null || VisibleDeveloperIds.Contains(developerId);

    public bool CanRequestProject(Guid projectId) =>
        VisibleProjectIds is null || VisibleProjectIds.Contains(projectId);

    /// <summary>
    /// Whether this person may see one developer's work on one project.
    /// </summary>
    /// <remarks>
    /// A missing project id is not another project's data: general feedback
    /// stays with every mentor assigned to the developer. A person's own rows
    /// are never narrowed by the projects they are responsible for.
    /// </remarks>
    public bool CanViewDeveloperProject(Guid developerId, Guid? projectId)
    {
        if (!CanViewDeveloper(developerId))
        {
            return false;
        }

        if (DeveloperId == developerId)
        {
            return true;
        }

        return projectId is not Guid id || CanRequestProject(id);
    }

    public void RequireDeveloperVisible(Guid developerId)
    {
        if (!CanViewDeveloper(developerId))
        {
            throw new ForbiddenException("That employee is outside the people you can see.");
        }
    }

    public void RequireDeveloperProjectVisible(Guid developerId, Guid? projectId)
    {
        RequireDeveloperVisible(developerId);

        if (!CanViewDeveloperProject(developerId, projectId))
        {
            throw new ForbiddenException(
                "That work is on a project you are not responsible for.");
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

    /// <summary>
    /// Narrows a requested project filter to the projects this person is
    /// responsible for. An open request becomes that list, so a mentor asking
    /// for everything is answered with their own projects.
    /// </summary>
    public IReadOnlyList<Guid>? RestrictProjectIds(IReadOnlyCollection<Guid>? requested)
    {
        if (VisibleProjectIds is null)
        {
            return requested is null || requested.Count == 0 ? null : [.. requested];
        }

        if (requested is null || requested.Count == 0)
        {
            return [.. VisibleProjectIds];
        }

        return [.. requested.Where(VisibleProjectIds.Contains)];
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
