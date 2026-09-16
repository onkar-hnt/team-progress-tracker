using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.OpenApi;

using Swashbuckle.AspNetCore.SwaggerGen;

using SharedKernel;

namespace Common;

/// <summary>
/// Marks an operation as needing a token, and says which roles are accepted,
/// only where that is actually true. Doing this per operation rather than
/// globally means signing in is not drawn with a padlock, and an endpoint
/// restricted to administrators says so.
/// </summary>
public sealed class AuthenticationOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var metadata = context.ApiDescription.ActionDescriptor.EndpointMetadata;

        if (metadata.OfType<IAllowAnonymous>().Any())
        {
            return;
        }

        var authorize = metadata.OfType<AuthorizeAttribute>().ToList();

        if (authorize.Count == 0)
        {
            return;
        }

        var policies = authorize
            .Select(attribute => attribute.Policy)
            .Where(policy => !string.IsNullOrEmpty(policy))
            .ToList();

        operation.Security =
        [
            new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference(JwtBearerDefaults.AuthenticationScheme)] = [],
            },
        ];

        var required = policies.Contains(AppPolicies.Admin)
            ? $"Requires the **{DomainRules.RoleAdmin}** role."
            : policies.Contains(AppPolicies.Privileged)
                ? $"Requires the **{DomainRules.RoleAdmin}** or **{DomainRules.RoleMentor}** role."
                : "Requires any signed-in user.";

        operation.Description = string.IsNullOrWhiteSpace(operation.Description)
            ? required
            : $"{operation.Description}\n\n{required}";
    }
}

/// <summary>
/// Adds the failures every endpoint can answer with, described in the same
/// envelope as everything else, so each controller does not have to repeat
/// five ProducesResponseType attributes.
/// </summary>
public sealed class StandardResponsesOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var errorSchema = context.SchemaGenerator.GenerateSchema(
            typeof(Contracts.ApiResponse),
            context.SchemaRepository);

        var anonymous = context.ApiDescription.ActionDescriptor.EndpointMetadata
            .OfType<IAllowAnonymous>().Any();

        var responses = operation.Responses ??= [];

        Add("400", "The request was refused; data.errors lists what needs correcting.");

        if (!anonymous)
        {
            Add("401", "No token, an expired token, or a token this service does not accept.");
            Add("403", "Signed in, but this role may not do that.");
        }

        if (context.ApiDescription.RelativePath?.Contains('{') == true)
        {
            Add("404", "No such record, or one this caller may not see.");
        }

        Add("500", "Something went wrong. The detail is logged, never returned.");

        void Add(string code, string description)
        {
            if (responses.ContainsKey(code))
            {
                return;
            }

            responses[code] = new OpenApiResponse
            {
                Description = description,
                Content = new Dictionary<string, OpenApiMediaType>
                {
                    ["application/json"] = new() { Schema = errorSchema },
                },
            };
        }
    }
}
