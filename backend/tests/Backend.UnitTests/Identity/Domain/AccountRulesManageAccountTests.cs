using Identity.Domain;

namespace Backend.UnitTests.Identity.Domain;

public sealed class AccountRulesManageAccountTests
{
    private static readonly Guid ActorId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid TargetId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private static AccountAction Action(
        string actorRole,
        string targetRole,
        bool actorActive = true,
        bool isSelf = false) =>
        new()
        {
            ActorRole = actorRole,
            ActorProfileId = isSelf ? TargetId : ActorId,
            ActorIsActive = actorActive,
            TargetProfileId = TargetId,
            TargetRole = targetRole,
        };

    [Fact]
    public void ActiveAdminMayManageDeveloperAccount()
    {
        var act = () => AccountRules.RequireCanManageAccount(
            Action(DomainRules.RoleAdmin, DomainRules.RoleDeveloper));

        act.Should().NotThrow();
    }

    [Fact]
    public void MentorCannotActivateOrDeactivateAccounts()
    {
        var act = () => AccountRules.RequireCanManageAccount(
            Action(DomainRules.RoleMentor, DomainRules.RoleDeveloper));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("Only an administrator can activate or deactivate a login.");
    }

    [Fact]
    public void InactiveAdminCannotManageAccounts()
    {
        var act = () => AccountRules.RequireCanManageAccount(
            Action(DomainRules.RoleAdmin, DomainRules.RoleDeveloper, actorActive: false));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("Only an administrator can activate or deactivate a login.");
    }

    [Fact]
    public void AdminCannotChangeStateOfOwnLogin()
    {
        var act = () => AccountRules.RequireCanManageAccount(
            Action(DomainRules.RoleAdmin, DomainRules.RoleDeveloper, isSelf: true));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("You cannot change the state of your own login.");
    }

    [Fact]
    public void AdminCannotDeactivateAnotherAdministratorsLogin()
    {
        var act = () => AccountRules.RequireCanManageAccount(
            Action(DomainRules.RoleAdmin, DomainRules.RoleAdmin));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("An administrator's login cannot be deactivated here.");
    }
}
