using System.Text.Json;

namespace Contracts;

/// <summary>
/// Remembers which JSON properties arrived on a PUT body so partial updates can
/// leave the rest alone. Request DTOs such as <see cref="SaveDeveloperRequest"/>
/// cannot express optionality on their own because missing keys deserialize to defaults.
/// </summary>
public sealed class JsonFieldSet
{
    private readonly HashSet<string> _names;

    private JsonFieldSet(IEnumerable<string> names) =>
        _names = new HashSet<string>(names, StringComparer.OrdinalIgnoreCase);

    public static JsonFieldSet From(JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object)
        {
            return new JsonFieldSet([]);
        }

        return new JsonFieldSet(body.EnumerateObject().Select(property => property.Name));
    }

    public static JsonFieldSet All { get; } = new(["*"]);

    public bool Has(string name) => _names.Contains("*") || _names.Contains(name);
}
