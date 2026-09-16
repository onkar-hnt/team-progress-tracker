using Contracts;

using Identity.Domain;

using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

using SharedKernel;

namespace Identity.Application;

/// <summary>
/// Everything an administrator, and in some cases a mentor, can do to somebody
/// else's login: list them, turn them on and off, create one for a person
/// already on the roster, and hand out a new password. The rules they checked
/// are <see cref="AccountRules"/> and are enforced here on the Identity API.
/// </summary>
public sealed class AccountService(
    IProfileRepository profiles,
    IPasswordHasher hasher,
    IRosterGateway roster,
    ICurrentUser currentUser,
    IOptions<ProfileActiveGateOptions> profileActiveGate,
    ILogger<AccountService> logger)
{
    private const string DevelopersTable = "developers";
    private const string MentorsTable = "mentors";

    public async Task<IReadOnlyList<AccountDto>> ListAsync(CancellationToken cancellationToken = default)
    {
        await RequireActiveActorAsync(cancellationToken);

        if (currentUser.Role != DomainRules.RoleAdmin)
        {
            throw new ForbiddenException("Only an administrator can see every login.");
        }

        var all = await profiles.ListAsync(cancellationToken);

        return [.. all
            .OrderBy(profile => profile.DisplayName, StringComparer.OrdinalIgnoreCase)
            .Select(profile => new AccountDto
            {
                Id = profile.Id,
                Email = profile.Email,
                DisplayName = profile.DisplayName,
                Role = profile.Role,
                Status = profile.Status,
                MustChangePassword = profile.MustChangePassword,
                CreatedAt = DateStrings.From(profile.CreatedAt),
            })];
    }

    public async Task<SetAccountStateResponse> SetStateAsync(
        SetAccountStateRequest request,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireActiveActorAsync(cancellationToken);

        var target = await profiles.FindByIdAsync(request.ProfileId, cancellationToken)
            ?? throw new NotFoundException("That login no longer exists.");

        AccountRules.RequireCanManageAccount(new AccountAction
        {
            ActorRole = actor.Role,
            ActorProfileId = actor.Id,
            ActorIsActive = actor.IsActive,
            TargetProfileId = target.Id,
            TargetRole = target.Role,
        });

        if (request.State is not (DomainRules.ProfileActive or DomainRules.ProfileInactive))
        {
            throw new ValidationFailedException("A login is either active or inactive.");
        }

        var unchanged = target.Status == request.State;

        if (!unchanged)
        {
            if (request.State == DomainRules.ProfileActive)
            {
                target.Activate();
            }
            else
            {
                target.Deactivate();
            }

            await profiles.SaveChangesAsync(cancellationToken);

            logger.LogInformation(
                "{ActorId} set login {TargetId} to {State}",
                actor.Id,
                target.Id,
                request.State);
        }

        var sessionsRevoked = target.Status == DomainRules.ProfileInactive;
        string? warning = null;

        if (!unchanged
            && request.State == DomainRules.ProfileInactive
            && sessionsRevoked)
        {
            var cacheSeconds = Math.Max(1, profileActiveGate.Value.StatusCacheSeconds);
            warning =
                $"Existing sessions stop working within {cacheSeconds} seconds at most, " +
                "because the gateway briefly caches login status.";
        }

        return new SetAccountStateResponse
        {
            ProfileId = target.Id,
            Name = target.DisplayName,
            State = target.Status,
            Unchanged = unchanged,
            SessionsRevoked = sessionsRevoked,
            Warning = warning,
        };
    }

    public async Task<ProvisionLoginResponse> ProvisionAsync(
        ProvisionLoginRequest request,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireActiveActorAsync(cancellationToken);
        var table = NormaliseTable(request.Table);

        var member = await roster.FindMemberAsync(table, request.RowId, cancellationToken)
            ?? throw new NotFoundException(
                table == MentorsTable
                    ? "That mentor is no longer on the roster."
                    : "That employee is no longer on the roster.");

        if (member.ProfileId is not null)
        {
            throw new ConflictException("That person already has a login.");
        }

        await RequireMayActOnMemberAsync(actor, table, member, DomainRules.RoleDeveloper, cancellationToken);

        var email = (request.Email ?? member.Email ?? string.Empty).Trim();

        if (email.Length == 0)
        {
            throw new ValidationFailedException(
                "An email address is needed to create a login.",
                ["Add an email address to this person first, or supply one here."]);
        }

        var existing = await profiles.FindByEmailAsync(email, cancellationToken);
        var temporaryPassword = PasswordPolicy.TemporaryFor(member.Name);
        var created = false;

        if (existing is null)
        {
            existing = new Profile
            {
                Email = email,
                DisplayName = member.Name,
                Role = RoleForNewLogin(table, member),
                Status = DomainRules.ProfileActive,
                MustChangePassword = true,
                PasswordHash = hasher.Hash(temporaryPassword),
            };

            profiles.Add(existing);
            created = true;
        }

        await profiles.SaveChangesAsync(cancellationToken);
        await roster.LinkProfileAsync(table, member.Id, existing.Id, cancellationToken);

        logger.LogInformation(
            "{ActorId} provisioned a login for {Table} {RowId} (created: {Created})",
            actor.Id,
            table,
            member.Id,
            created);

        return new ProvisionLoginResponse
        {
            ProfileId = existing.Id,
            Email = existing.Email,
            TemporaryPassword = created ? temporaryPassword : string.Empty,
            Created = created,
        };
    }

    public async Task<ResetUserPasswordResponse> ResetPasswordAsync(
        ResetUserPasswordRequest request,
        CancellationToken cancellationToken = default)
    {
        var actor = await RequireActiveActorAsync(cancellationToken);
        var table = NormaliseTable(request.Table);

        var member = await roster.FindMemberAsync(table, request.RowId, cancellationToken)
            ?? throw new NotFoundException("That person is no longer on the roster.");

        if (member.ProfileId is null)
        {
            throw new ValidationFailedException("That person does not have a login yet.");
        }

        var target = await profiles.FindByIdAsync(member.ProfileId.Value, cancellationToken)
            ?? throw new NotFoundException("That login no longer exists.");

        await RequireMayActOnMemberAsync(actor, table, member, target.Role, cancellationToken);

        PasswordPolicy.Require(request.Password);

        target.PasswordHash = hasher.Hash(request.Password);

        // Handed out by somebody else, so it counts as temporary again.
        target.MustChangePassword = true;

        await profiles.SaveChangesAsync(cancellationToken);

        logger.LogInformation("{ActorId} reset the password for {TargetId}", actor.Id, target.Id);

        return new ResetUserPasswordResponse
        {
            ProfileId = target.Id,
            Name = target.DisplayName,
            Email = target.Email,
            MustChangePassword = target.MustChangePassword,
        };
    }

    private async Task RequireMayActOnMemberAsync(
        Profile actor,
        string table,
        RosterMemberDto member,
        string targetRole,
        CancellationToken cancellationToken)
    {
        var assigned = actor.Role == DomainRules.RoleMentor
            && table == DevelopersTable
            && currentUser.MentorId is { } mentorId
            && await roster.MentorSeesDeveloperAsync(mentorId, member.Id, cancellationToken);

        AccountRules.RequireCanResetPassword(new AccountAction
        {
            ActorRole = actor.Role,
            ActorProfileId = actor.Id,
            ActorIsActive = actor.IsActive,
            TargetProfileId = member.ProfileId ?? Guid.Empty,
            TargetRole = table == MentorsTable ? DomainRules.RoleMentor : targetRole,
            TargetIsAssignedToActor = assigned,
            TargetIsAlsoMentor = member.IsAlsoMentor,
            TargetAccessRole = member.AccessRole,
        });
    }

    private static string RoleForNewLogin(string table, RosterMemberDto member)
    {
        if (table == MentorsTable)
        {
            return DomainRules.RoleMentor;
        }

        // An employee row can ask for mentor access, but never for admin:
        // promoting somebody to administrator is not something provisioning does.
        return member.AccessRole == DomainRules.RoleMentor
            ? DomainRules.RoleMentor
            : DomainRules.RoleDeveloper;
    }

    private static string NormaliseTable(string? table) => table switch
    {
        DevelopersTable => DevelopersTable,
        MentorsTable => MentorsTable,
        _ => throw new ValidationFailedException("A login belongs either to an employee or a mentor."),
    };

    private async Task<Profile> RequireActiveActorAsync(CancellationToken cancellationToken)
    {
        var actor = await profiles.FindByIdAsync(currentUser.ProfileId, cancellationToken)
            ?? throw new UnauthenticatedException();

        if (!actor.IsActive)
        {
            throw new ForbiddenException("Your own account is not active.");
        }

        return actor;
    }
}
