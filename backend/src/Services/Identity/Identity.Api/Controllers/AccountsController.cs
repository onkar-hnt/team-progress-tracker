using Common;

using Contracts;

using Identity.Application;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Identity.Api.Controllers;

/// <summary>
/// Managing other people's logins: listing them, turning them on and off,
/// creating one for somebody already on the roster, and handing out a new
/// password. Nobody acts on their own account or an administrator's here.
/// </summary>
[ApiController]
[Route("api/accounts")]
[Authorize(Policy = AppPolicies.Privileged)]
[Tags("Accounts")]
public sealed class AccountsController(AccountService accounts) : ControllerBase
{
    /// <summary>Every login, for the Logins screen.</summary>
    [HttpGet]
    [Authorize(Policy = AppPolicies.Admin)]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<AccountDto>>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<AccountDto>>>> List(
        CancellationToken cancellationToken)
    {
        var result = await accounts.ListAsync(cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<AccountDto>>.Ok(result));
    }

    /// <summary>Activates or deactivates a login.</summary>
    [HttpPost("state")]
    [Authorize(Policy = AppPolicies.Admin)]
    [ProducesResponseType(typeof(ApiResponse<SetAccountStateResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ApiResponse<SetAccountStateResponse>>> SetState(
        SetAccountStateRequest request,
        CancellationToken cancellationToken)
    {
        var result = await accounts.SetStateAsync(request, cancellationToken);

        var message = result.Unchanged ? "Login was already in that state." : "Login updated.";

        return Ok(ApiResponse<SetAccountStateResponse>.Ok(result, message));
    }

    /// <summary>Creates a login for somebody already on the roster.</summary>
    /// <remarks>
    /// Returns the temporary password to hand over, derived from their name.
    /// They must replace it before the app lets them do anything else. An
    /// administrator can provision anybody; a mentor only an employee assigned
    /// to them who is not also a mentor.
    /// </remarks>
    /// <response code="409">That person already has a login.</response>
    [HttpPost("provision")]
    [ProducesResponseType(typeof(ApiResponse<ProvisionLoginResponse>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict)]
    public async Task<ActionResult<ApiResponse<ProvisionLoginResponse>>> Provision(
        ProvisionLoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await accounts.ProvisionAsync(request, cancellationToken);

        return StatusCode(
            StatusCodes.Status201Created,
            ApiResponse<ProvisionLoginResponse>.Created(result, "Login created."));
    }

    /// <summary>Sets somebody else's password, which they must then change.</summary>
    /// <remarks>
    /// Never your own — use change-password for that — and never an
    /// administrator's. A mentor may only reset an employee assigned to them
    /// who has no elevated access and is not also a mentor.
    /// </remarks>
    [HttpPost("reset-password")]
    [ProducesResponseType(typeof(ApiResponse<ResetUserPasswordResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ApiResponse<ResetUserPasswordResponse>>> ResetPassword(
        ResetUserPasswordRequest request,
        CancellationToken cancellationToken)
    {
        var result = await accounts.ResetPasswordAsync(request, cancellationToken);

        return Ok(ApiResponse<ResetUserPasswordResponse>.Ok(result, "Password reset."));
    }
}
