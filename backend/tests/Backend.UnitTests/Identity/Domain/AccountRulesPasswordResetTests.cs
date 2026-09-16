using Identity.Domain;

namespace Backend.UnitTests.Identity.Domain;

public sealed class AccountRulesPasswordResetTests
{
    private static readonly Guid ActorId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid TargetId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private static AccountAction Action(
        string actorRole,
        string targetRole,
        bool actorActive = true,
        bool isSelf = false,
        bool assigned = false,
        bool targetAlsoMentor = false,
        string? targetAccessRole = null) =>
        new()
        {
            ActorRole = actorRole,
            ActorProfileId = isSelf ? TargetId : ActorId,
            ActorIsActive = actorActive,
            TargetProfileId = TargetId,
            TargetRole = targetRole,
            TargetIsAssignedToActor = assigned,
            TargetIsAlsoMentor = targetAlsoMentor,
            TargetAccessRole = targetAccessRole,
        };

    [Fact]
    public void AdminMayResetDeveloperPassword()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleAdmin, DomainRules.RoleDeveloper));

        act.Should().NotThrow();
    }

    [Fact]
    public void AdminMayResetMentorPassword()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleAdmin, DomainRules.RoleMentor));

        act.Should().NotThrow();
    }

    [Fact]
    public void MentorMayResetAssignedDeveloperPassword()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleMentor, DomainRules.RoleDeveloper, assigned: true));

        act.Should().NotThrow();
    }

    [Fact]
    public void InactiveActorCannotResetAnyPassword()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleAdmin, DomainRules.RoleDeveloper, actorActive: false));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("Your own account is not active.");
    }

    [Fact]
    public void NobodyMayResetTheirOwnPasswordThroughThisPath()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleAdmin, DomainRules.RoleDeveloper, isSelf: true));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("Change your own password from your profile instead.");
    }

    [Fact]
    public void NobodyMayResetAnAdministratorsPassword()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleAdmin, DomainRules.RoleAdmin));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("An administrator's password cannot be reset here.");
    }

    [Fact]
    public void DeveloperCannotResetAnyPassword()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleDeveloper, DomainRules.RoleDeveloper, assigned: true));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("Only an administrator or a mentor can reset a password.");
    }

    [Fact]
    public void MentorCannotResetAnotherMentorsPassword()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleMentor, DomainRules.RoleMentor, assigned: true));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("A mentor can only reset an employee's password.");
    }

    [Fact]
    public void MentorCannotResetUnassignedDeveloperPassword()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleMentor, DomainRules.RoleDeveloper, assigned: false));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("That employee is outside the people you can see.");
    }

    [Fact]
    public void MentorCannotResetDeveloperWhoIsAlsoMentor()
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(DomainRules.RoleMentor, DomainRules.RoleDeveloper, assigned: true, targetAlsoMentor: true));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("That person is also a mentor, so only an administrator can reset their password.");
    }

    [Theory]
    [InlineData(DomainRules.RoleAdmin)]
    [InlineData(DomainRules.RoleMentor)]
    public void MentorCannotResetDeveloperWithElevatedAccessRole(string accessRole)
    {
        var act = () => AccountRules.RequireCanResetPassword(
            Action(
                DomainRules.RoleMentor,
                DomainRules.RoleDeveloper,
                assigned: true,
                targetAccessRole: accessRole));

        act.Should().Throw<ForbiddenException>()
            .WithMessage("That person has elevated access, so only an administrator can reset their password.");
    }
}
