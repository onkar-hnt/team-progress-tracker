using System.Security.Claims;

using Microsoft.AspNetCore.Http;

using SharedKernel;

namespace Common;

public sealed class CurrentUserAccessor(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    public Guid ProfileId =>
        Guid.TryParse(Find(AppClaims.ProfileId) ?? Find(ClaimTypes.NameIdentifier), out var id)
            ? id
            : throw new UnauthenticatedException();

    public string Email => Find(ClaimTypes.Email) ?? string.Empty;

    public string Role => Find(ClaimTypes.Role) ?? DomainRules.RoleDeveloper;

    public Guid? DeveloperId => ParseOptional(AppClaims.DeveloperId);

    public Guid? MentorId => ParseOptional(AppClaims.MentorId);

    private string? Find(string claim) => Principal?.FindFirst(claim)?.Value;

    private Guid? ParseOptional(string claim) =>
        Guid.TryParse(Find(claim), out var id) ? id : null;
}
