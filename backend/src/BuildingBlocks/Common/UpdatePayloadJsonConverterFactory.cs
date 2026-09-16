using System.Text.Json;
using System.Text.Json.Serialization;

using Contracts;

namespace Common;

/// <summary>
/// Deserialises PUT bodies into <see cref="UpdatePayload{TRequest}"/> by
/// recording which JSON keys arrived alongside the request DTO.
/// </summary>
public sealed class UpdatePayloadJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsGenericType
        && typeToConvert.GetGenericTypeDefinition() == typeof(UpdatePayload<>);

    public override JsonConverter? CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        var requestType = typeToConvert.GetGenericArguments()[0];
        var converterType = typeof(UpdatePayloadConverter<>).MakeGenericType(requestType);

        return (JsonConverter?)Activator.CreateInstance(converterType);
    }

    private sealed class UpdatePayloadConverter<TRequest> : JsonConverter<UpdatePayload<TRequest>>
    {
        public override UpdatePayload<TRequest>? Read(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options)
        {
            using var document = JsonDocument.ParseValue(ref reader);

            var request = document.RootElement.Deserialize<TRequest>(options)
                ?? Activator.CreateInstance<TRequest>()!;

            return new UpdatePayload<TRequest>(request, JsonFieldSet.From(document.RootElement));
        }

        public override void Write(
            Utf8JsonWriter writer,
            UpdatePayload<TRequest> value,
            JsonSerializerOptions options) =>
            JsonSerializer.Serialize(writer, value.Request, options);
    }
}
