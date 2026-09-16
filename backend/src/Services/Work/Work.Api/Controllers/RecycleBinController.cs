using Common;

using Contracts;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

using Work.Application;

namespace Work.Api.Controllers;

/// <summary>
/// Recently deleted, across every kind of record. Deleting anywhere in the app
/// lands here first; fifteen days after deletion it is destroyed for good
/// unless somebody restores it, so the database does not fill up with things
/// nobody is coming back for.
/// </summary>
[ApiController]
[Route("api/recycle-bin")]
[Authorize]
[Tags("Recently deleted")]
public sealed class RecycleBinController(RecycleBinService recycleBin) : ControllerBase
{
    /// <summary>Lists everything the caller may restore, newest first.</summary>
    /// <remarks>
    /// Each row says what kind it is, how it was labelled, who deleted it and
    /// when it will be destroyed.
    /// </remarks>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DeletedRecordDto>>>> List(
        CancellationToken cancellationToken)
    {
        var result = await recycleBin.ListAsync(cancellationToken);

        return Ok(ApiResponse<IReadOnlyList<DeletedRecordDto>>.Ok(result));
    }

    /// <summary>Puts a deleted record back.</summary>
    /// <remarks>
    /// Refused when what it belongs to is itself still deleted — a task cannot
    /// come back under a deleted project — so restoring never leaves a record
    /// pointing at nothing.
    /// </remarks>
    /// <param name="kind">task, entry, feedback, employee, mentor or project.</param>
    /// <param name="id">The deleted record's id.</param>
    /// <response code="409">What this belongs to is still deleted.</response>
    [HttpPost("{kind}/{id:guid}/restore")]
    public async Task<ActionResult<ApiResponse>> Restore(
        string kind,
        Guid id,
        CancellationToken cancellationToken)
    {
        await recycleBin.RestoreAsync(kind, id, cancellationToken);

        return Ok(ApiResponse.Ok("Item restored."));
    }

    /// <summary>Destroys a deleted record now, without waiting fifteen days.</summary>
    /// <param name="kind">task, entry, feedback, employee, mentor or project.</param>
    /// <param name="id">The deleted record's id.</param>
    [HttpDelete("{kind}/{id:guid}")]
    public async Task<ActionResult<ApiResponse>> Destroy(
        string kind,
        Guid id,
        CancellationToken cancellationToken)
    {
        await recycleBin.DestroyAsync(kind, id, cancellationToken);

        return Ok(ApiResponse.Ok("Item permanently deleted."));
    }
}
