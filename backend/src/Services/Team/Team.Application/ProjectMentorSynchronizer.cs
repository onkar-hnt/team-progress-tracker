namespace Team.Application;

/// <summary>
/// Works out which mentors are responsible for a project, keeping the set in
/// step with the one mentor named on the project itself. This is the
/// sync_project_mentor trigger the Postgres schema used to carry.
/// </summary>
/// <remarks>
/// A write that only sets the primary mentor — an older client, a hand edit —
/// still has to grant that mentor the project, or the project disappears from
/// the list they are allowed to read.
/// </remarks>
public static class ProjectMentorSynchronizer
{
    /// <summary>
    /// The set for a project being created. The mentor doing the creating is
    /// included so they can read back what they just wrote.
    /// </summary>
    public static IReadOnlyList<Guid> ForCreate(
        IReadOnlyList<Guid>? requested,
        Guid? primaryMentorId,
        Guid? authorMentorId) =>
        Combine(requested ?? [], primaryMentorId, authorMentorId);

    /// <summary>
    /// The set for a project being changed. Responsibility is not granted to
    /// whoever happens to be editing, only to the mentors named.
    /// </summary>
    public static IReadOnlyList<Guid> ForUpdate(
        IReadOnlyList<Guid> requested,
        Guid? primaryMentorId) =>
        Combine(requested, primaryMentorId, null);

    private static IReadOnlyList<Guid> Combine(
        IReadOnlyList<Guid> requested,
        Guid? primaryMentorId,
        Guid? authorMentorId)
    {
        // The primary mentor leads so the stored order matches what the DTO
        // reports, and callers can read the first id as the owner.
        var combined = new List<Guid>();

        if (primaryMentorId is Guid primary)
        {
            combined.Add(primary);
        }

        combined.AddRange(requested);

        if (authorMentorId is Guid author)
        {
            combined.Add(author);
        }

        return [.. combined.Distinct()];
    }
}
