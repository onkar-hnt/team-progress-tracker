using System.Collections;
using System.ComponentModel;

using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Common;

/// <summary>
/// Binds a list query parameter from one comma-separated value
/// (<c>?developerIds=a,b</c>) as well as from repeated ones
/// (<c>?developerIds=a&amp;developerIds=b</c>).
/// <para>
/// The frontend sends the first form — one <see cref="System.Uri"/> query key
/// per filter, values joined with commas — and MVC understands only the
/// second, which is why a query record with a collection property used to come
/// back as a 400 with no explanation. With this registered, an endpoint can
/// take a <c>[FromQuery] SomeQuery</c> record and read the collection straight
/// off it instead of accepting a string per filter and splitting it by hand.
/// </para>
/// <para>
/// A parameter that is absent leaves the property null, and one that is
/// present but empty binds an empty list, the same as
/// <see cref="QueryBinding"/>. What a service makes of an empty list is its
/// own rule rather than the binder's; today
/// <see cref="SharedKernel.AccessScope.RestrictDeveloperIds"/> reads it as no
/// narrowing at all, so both forms answer with everything the caller may see.
/// </para>
/// </summary>
public sealed class CommaSeparatedListModelBinder(Type elementType) : IModelBinder
{
    private readonly TypeConverter _converter = TypeDescriptor.GetConverter(elementType);

    public Task BindModelAsync(ModelBindingContext bindingContext)
    {
        ArgumentNullException.ThrowIfNull(bindingContext);

        var values = bindingContext.ValueProvider.GetValue(bindingContext.ModelName);

        if (values == ValueProviderResult.None)
        {
            return Task.CompletedTask;
        }

        var list = (IList)Activator.CreateInstance(typeof(List<>).MakeGenericType(elementType))!;

        foreach (var value in values)
        {
            var parts = (value ?? string.Empty).Split(
                ',',
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            foreach (var part in parts)
            {
                // An unreadable id is dropped rather than refused. A filter is
                // the caller narrowing what they asked for, so the answer to a
                // value that names nothing is that it matches nothing — not a
                // 400 for the whole screen.
                if (_converter.IsValid(part))
                {
                    list.Add(_converter.ConvertFromInvariantString(part));
                }
            }
        }

        bindingContext.Result = ModelBindingResult.Success(list);

        return Task.CompletedTask;
    }
}

/// <summary>
/// Offers <see cref="CommaSeparatedListModelBinder"/> for any collection of a
/// type that converts from a string. Inserted at the front of the providers so
/// it is preferred over MVC's own collection binder, which reads only repeated
/// parameters.
/// </summary>
/// <remarks>
/// Only reached for values that come from the query string or a form. A model
/// bound from the request body is handled whole by the body binder, which
/// never consults a property binder, so JSON arrays are unaffected.
/// </remarks>
public sealed class CommaSeparatedListModelBinderProvider : IModelBinderProvider
{
    public IModelBinder? GetBinder(ModelBinderProviderContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (context.BindingInfo.BindingSource == BindingSource.Body)
        {
            return null;
        }

        var elementType = ElementTypeOf(context.Metadata.ModelType);

        if (elementType is null || elementType == typeof(byte))
        {
            return null;
        }

        return TypeDescriptor.GetConverter(elementType).CanConvertFrom(typeof(string))
            ? new CommaSeparatedListModelBinder(elementType)
            : null;
    }

    /// <summary>
    /// The element type when the model is a list-like generic that a
    /// <c>List&lt;T&gt;</c> can be assigned to, and null otherwise. A string is
    /// not treated as a collection of characters.
    /// </summary>
    private static Type? ElementTypeOf(Type modelType)
    {
        if (modelType == typeof(string) || !modelType.IsGenericType)
        {
            return null;
        }

        var elementType = modelType.GetGenericArguments()[0];

        return typeof(List<>).MakeGenericType(elementType).IsAssignableTo(modelType)
            ? elementType
            : null;
    }
}
