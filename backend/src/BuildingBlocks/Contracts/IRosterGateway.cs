namespace Contracts;

public sealed record RosterLinks(Guid? DeveloperId, Guid? MentorId);

/// <summary>
/// Identity owns logins; the roster owns who works here. Provisioning has to
/// touch both — it reads a person's name and email to create their login, then
/// writes the link back — so that crossing is named here rather than left
/// implicit. Only the identity link column is written; nothing else on a
/// roster row is Identity's to change.
/// </summary>
public interface IRosterGateway
{
    /// <summary>Which roster rows, if any, a login belongs to.</summary>
    Task<RosterLinks> FindLinksAsync(Guid profileId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A roster row by table ("developers" or "mentors") and id, with the
    /// details account rules need.
    /// </summary>
    Task<RosterMemberDto?> FindMemberAsync(
        string table,
        Guid rowId,
        CancellationToken cancellationToken = default);

    Task LinkProfileAsync(
        string table,
        Guid rowId,
        Guid profileId,
        CancellationToken cancellationToken = default);

    Task<bool> MentorSeesDeveloperAsync(
        Guid mentorId,
        Guid developerId,
        CancellationToken cancellationToken = default);
}
