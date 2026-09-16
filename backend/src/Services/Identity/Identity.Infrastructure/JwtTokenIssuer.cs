using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

using Identity.Application;
using Identity.Domain;

using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

using SharedKernel;

namespace Identity.Infrastructure;

public sealed class JwtTokenIssuer(IOptions<JwtOptions> options, IClock clock) : ITokenIssuer
{
    private readonly JwtOptions settings = options.Value;

    public IssuedToken Issue(Profile profile, Guid? developerId, Guid? mentorId)
    {
        var expiresAt = clock.Now.AddMinutes(settings.LifetimeMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Subject, profile.Id.ToString()),
            new(AppClaims.ProfileId, profile.Id.ToString()),
            new(ClaimTypes.Email, profile.Email),
            new(ClaimTypes.Role, profile.Role),
            new(AppClaims.MustChangePassword, profile.MustChangePassword ? "true" : "false"),
        };

        if (developerId is { } developer)
        {
            claims.Add(new Claim(AppClaims.DeveloperId, developer.ToString()));
        }

        if (mentorId is { } mentor)
        {
            claims.Add(new Claim(AppClaims.MentorId, mentor.ToString()));
        }

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.SigningKey)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: settings.Issuer,
            audience: settings.Audience,
            claims: claims,
            notBefore: clock.Now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new IssuedToken(new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}

internal static class JwtRegisteredClaimNames
{
    public const string Subject = "sub";
}
