using SharedKernel;

namespace Identity.Domain;

/// <summary>What an actor is asking to do to somebody else's account.</summary>
public sealed record AccountAction
{
    public required string ActorRole { get; init; }
    public required Guid ActorProfileId { get; init; }
    public required bool ActorIsActive { get; init; }

    public required Guid TargetProfileId { get; init; }
    public required string TargetRole { get; init; }

    /// <summary>Whether the target is a developer this mentor is assigned to.</summary>
    public bool TargetIsAssignedToActor { get; init; }

    /// <summary>Set when the target also has a mentor row, which stops a mentor resetting them.</summary>
    public bool TargetIsAlsoMentor { get; init; }

    public string? TargetAccessRole { get; init; }

    public bool IsSelf => ActorProfileId == TargetProfileId;
}

/// <summary>
/// The password reset and account state matrices, which lived in Postgres as
/// may_reset_password() and may_manage_account(). Two rules hold throughout:
/// nobody acts on their own account through these paths, and nobody acts on an
/// admin's.
/// </summary>
public static class AccountRules
{
    public static void RequireCanResetPassword(AccountAction action)
    {
        if (!action.ActorIsActive)
        {
            throw new ForbiddenException("Your own account is not active.");
        }

        if (action.IsSelf)
        {
            throw new ForbiddenException(
                "Change your own password from your profile instead.");
        }

        if (action.TargetRole == DomainRules.RoleAdmin)
        {
            throw new ForbiddenException("An administrator's password cannot be reset here.");
        }

        if (action.ActorRole == DomainRules.RoleAdmin)
        {
            return;
        }

        if (action.ActorRole != DomainRules.RoleMentor)
        {
            throw new ForbiddenException("Only an administrator or a mentor can reset a password.");
        }

        if (action.TargetRole != DomainRules.RoleDeveloper)
        {
            throw new ForbiddenException("A mentor can only reset an employee's password.");
        }

        if (action.TargetIsAlsoMentor)
        {
            throw new ForbiddenException(
                "That person is also a mentor, so only an administrator can reset their password.");
        }

        if (action.TargetAccessRole is not null and not DomainRules.RoleDeveloper)
        {
            throw new ForbiddenException(
                "That person has elevated access, so only an administrator can reset their password.");
        }

        if (!action.TargetIsAssignedToActor)
        {
            throw new ForbiddenException("That employee is outside the people you can see.");
        }
    }

    public static void RequireCanManageAccount(AccountAction action)
    {
        if (action.ActorRole != DomainRules.RoleAdmin || !action.ActorIsActive)
        {
            throw new ForbiddenException("Only an administrator can activate or deactivate a login.");
        }

        if (action.IsSelf)
        {
            throw new ForbiddenException("You cannot change the state of your own login.");
        }

        if (action.TargetRole == DomainRules.RoleAdmin)
        {
            throw new ForbiddenException("An administrator's login cannot be deactivated here.");
        }
    }
}
