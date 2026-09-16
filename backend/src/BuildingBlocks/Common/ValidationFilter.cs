using FluentValidation;

using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

using SharedKernel;

namespace Common;

/// <summary>
/// Runs any registered validator over the action's arguments before the action
/// sees them, so handlers can assume a well-formed request and no controller
/// repeats a ModelState check. Failures become one
/// <see cref="ValidationFailedException"/>, which the error middleware turns
/// into a 400 listing every problem rather than only the first.
/// </summary>
public sealed class ValidationFilter : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        var problems = new List<string>();

        foreach (var argument in context.ActionArguments.Values)
        {
            if (argument is null)
            {
                continue;
            }

            var validatorType = typeof(IValidator<>).MakeGenericType(argument.GetType());

            if (context.HttpContext.RequestServices.GetService(validatorType) is not IValidator validator)
            {
                continue;
            }

            var contextType = typeof(ValidationContext<>).MakeGenericType(argument.GetType());
            var validationContext = (IValidationContext)Activator.CreateInstance(contextType, argument)!;

            var result = await validator.ValidateAsync(
                validationContext,
                context.HttpContext.RequestAborted);

            problems.AddRange(result.Errors.Select(failure => failure.ErrorMessage));
        }

        if (problems.Count > 0)
        {
            throw new ValidationFailedException(
                "Some details need correcting before this can be saved.",
                problems);
        }

        await next();
    }
}
