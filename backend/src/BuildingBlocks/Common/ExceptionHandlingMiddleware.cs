using System.Net;
using System.Text.Json;

using Contracts;

using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

using SharedKernel;

namespace Common;

/// <summary>
/// The only place an exception becomes a response, so controllers and handlers
/// can throw and stay readable. Nothing a database or the runtime says reaches
/// the browser: unexpected failures are logged with their detail and answered
/// with one sentence.
/// </summary>
public sealed class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception exception)
        {
            var (status, message, errors) = Describe(exception);

            if (status == HttpStatusCode.InternalServerError)
            {
                logger.LogError(
                    exception,
                    "Unhandled failure on {Method} {Path}",
                    context.Request.Method,
                    context.Request.Path);
            }
            else
            {
                logger.LogInformation(
                    "Refused {Method} {Path}: {Reason}",
                    context.Request.Method,
                    context.Request.Path,
                    message);
            }

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = (int)status;
            context.Response.ContentType = "application/json";

            await context.Response.WriteAsync(
                JsonSerializer.Serialize(ApiResponse.Failure((int)status, message, errors), Json));
        }
    }

    private static (HttpStatusCode Status, string Message, IReadOnlyList<string> Errors) Describe(
        Exception exception) => exception switch
    {
        ValidationFailedException failure =>
            (HttpStatusCode.BadRequest, failure.Message, failure.Errors),
        UnauthenticatedException failure =>
            (HttpStatusCode.Unauthorized, failure.Message, failure.Errors),
        ForbiddenException failure =>
            (HttpStatusCode.Forbidden, failure.Message, failure.Errors),
        NotFoundException failure =>
            (HttpStatusCode.NotFound, failure.Message, failure.Errors),
        ConflictException failure =>
            (HttpStatusCode.Conflict, failure.Message, failure.Errors),
        UnauthorizedAccessException =>
            (HttpStatusCode.Forbidden, "You are not allowed to do that.", (IReadOnlyList<string>)[]),
        OperationCanceledException =>
            (HttpStatusCode.RequestTimeout, "The request was cancelled.", (IReadOnlyList<string>)[]),
        _ => (HttpStatusCode.InternalServerError,
            "Something went wrong. Please try again.", (IReadOnlyList<string>)[]),
    };
}
