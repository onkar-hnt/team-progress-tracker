using System.Text.Json;

using Contracts;

using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

using SharedKernel;

namespace ApiGateway;

/// <summary>
/// JWTs stay valid until they expire, so deactivating a login in Identity does
/// not by itself stop Team, Work and the rest. This layer re-checks
/// identity.Profiles.Status for authenticated traffic before YARP forwards it.
/// </summary>
public sealed class ProfileActiveGateMiddleware(
    RequestDelegate next,
    IMemoryCache cache,
    SqlProfileStatusReader statusReader,
    IOptions<ProfileActiveGateOptions> gateOptions,
    ILogger<ProfileActiveGateMiddleware> logger)
{
    private static readonly JsonSerializerOptions EnvelopeJson = new(JsonSerializerDefaults.Web);

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            await next(context);
            return;
        }

        var profileClaim = context.User.FindFirst(AppClaims.ProfileId)?.Value;

        if (string.IsNullOrWhiteSpace(profileClaim) || !Guid.TryParse(profileClaim, out var profileId))
        {
            logger.LogDebug(
                "Skipping profile active check: profile_id claim missing or not a GUID on {Method} {Path}.",
                context.Request.Method,
                context.Request.Path);

            await next(context);
            return;
        }

        var cacheSeconds = Math.Max(1, gateOptions.Value.StatusCacheSeconds);
        var cacheKey = $"profile-status:{profileId:D}";

        var status = await cache.GetOrCreateAsync(cacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(cacheSeconds);
            return await statusReader.GetStatusAsync(profileId, context.RequestAborted);
        });

        if (status is null)
        {
            logger.LogDebug(
                "Skipping profile active check: no profile row for {ProfileId} on {Method} {Path}.",
                profileId,
                context.Request.Method,
                context.Request.Path);

            await next(context);
            return;
        }

        if (status == DomainRules.ProfileActive)
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";

        await context.Response.WriteAsync(JsonSerializer.Serialize(
            ApiResponse.Failure(
                StatusCodes.Status403Forbidden,
                "This login has been deactivated. Sign out and contact your administrator if you need access again."),
            EnvelopeJson));
    }
}
