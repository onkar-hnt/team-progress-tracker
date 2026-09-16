using Contracts;

using Identity.Application;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Identity.Api.Controllers;

/// <summary>
/// Signing in, reading the signed-in person back, and setting a password.
/// The token returned here is accepted by every other service.
/// </summary>
[ApiController]
[Route("api/auth")]
[Authorize]
[Tags("Authentication")]
public sealed class AuthController(AuthService auth) : ControllerBase
{
    /// <summary>Exchanges an email and password for a token.</summary>
    /// <remarks>
    /// The same message answers an unknown address and a wrong password, so
    /// this cannot be used to find out who has an account. A login that has
    /// been deactivated is refused with 403 and told why.
    ///
    /// When data.user.mustChangePassword is true the app allows nothing but
    /// POST /api/auth/change-password, and the roster links are withheld.
    /// </remarks>
    /// <response code="401">That email and password do not match.</response>
    /// <response code="403">This login has been deactivated.</response>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(ApiResponse<SignInResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ApiResponse<SignInResponse>>> Login(
        SignInRequest request,
        CancellationToken cancellationToken)
    {
        var result = await auth.SignInAsync(request, cancellationToken);

        return Ok(ApiResponse<SignInResponse>.Ok(result, "Signed in."));
    }

    /// <summary>The signed-in person, re-read from the database.</summary>
    [HttpGet("me")]
    [ProducesResponseType(typeof(ApiResponse<AuthenticatedUserDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<ApiResponse<AuthenticatedUserDto>>> Me(
        CancellationToken cancellationToken)
    {
        var user = await auth.GetCurrentAsync(cancellationToken);

        return Ok(ApiResponse<AuthenticatedUserDto>.Ok(user));
    }

    /// <summary>
    /// Sets a new password and returns a fresh token, so a forced change lands
    /// the person in the app rather than back at sign-in.
    /// </summary>
    [HttpPost("change-password")]
    [ProducesResponseType(typeof(ApiResponse<SignInResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ApiResponse<SignInResponse>>> ChangePassword(
        ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var result = await auth.ChangePasswordAsync(request, cancellationToken);

        return Ok(ApiResponse<SignInResponse>.Ok(result, "Password updated."));
    }
}
