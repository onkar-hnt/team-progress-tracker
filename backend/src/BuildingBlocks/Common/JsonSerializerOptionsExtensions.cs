using System.Text.Json;

namespace Common;

public static class JsonSerializerOptionsExtensions
{
    public static JsonSerializerOptions AddUpdatePayloadSupport(this JsonSerializerOptions options)
    {
        options.Converters.Add(new UpdatePayloadJsonConverterFactory());

        return options;
    }
}
