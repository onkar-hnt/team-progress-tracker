using System.Net;
using System.Text.Json;

using Contracts;

using FluentAssertions;

using Xunit.Sdk;

namespace Backend.IntegrationTests.Infrastructure;

public sealed record ApiEnvelope(int Status, string Message, JsonElement? Data)
{
    public void AssertHttpMatches(HttpResponseMessage response)
    {
        var httpStatus = (int)response.StatusCode;

        if (httpStatus != Status)
        {
            throw new XunitException(
                $"Expected HTTP {httpStatus} to match envelope status {Status}. Message: {Message}");
        }
    }
}

public static class ApiEnvelopeReader
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task<ApiEnvelope> ReadAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();

        JsonDocument document;

        try
        {
            document = JsonDocument.Parse(body);
        }
        catch (JsonException)
        {
            throw new XunitException(
                $"Response body is not JSON (HTTP {(int)response.StatusCode}). Body: {Truncate(body)}");
        }

        using (document)
        {
            var root = document.RootElement.Clone();

            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("message", out var messageElement)
                || !root.TryGetProperty("status", out var statusElement))
            {
                throw new XunitException(
                    $"Response is not an API envelope (HTTP {(int)response.StatusCode}). Body: {Truncate(body)}");
            }

            var message = messageElement.GetString() ?? string.Empty;

            if (!statusElement.TryGetInt32(out var status))
            {
                throw new XunitException($"Envelope status is not an integer. Body: {Truncate(body)}");
            }

            JsonElement? data = root.TryGetProperty("data", out var dataElement)
                ? dataElement.Clone()
                : null;

            return new ApiEnvelope(status, message, data);
        }
    }

    public static async Task<T> ReadDataAsync<T>(HttpResponseMessage response)
    {
        var envelope = await ReadAsync(response);

        if (!response.IsSuccessStatusCode)
        {
            throw new XunitException(
                $"Expected HTTP success for {typeof(T).Name} but got {(int)response.StatusCode}. Message: {envelope.Message}");
        }

        envelope.AssertHttpMatches(response);

        if (envelope.Data is null)
        {
            throw new XunitException(
                $"Expected envelope data for {typeof(T).Name} but data was null. Message: {envelope.Message}");
        }

        var parsed = envelope.Data.Value.Deserialize<T>(Json);

        if (parsed is null)
        {
            throw new XunitException(
                $"Could not deserialise envelope data to {typeof(T).Name}. Message: {envelope.Message}");
        }

        return parsed;
    }

    public static async Task<ApiEnvelope> ExpectFailureAsync(
        HttpResponseMessage response,
        HttpStatusCode expectedStatus)
    {
        var envelope = await ReadAsync(response);
        ((int)expectedStatus).Should().Be(envelope.Status);
        response.StatusCode.Should().Be(expectedStatus);
        return envelope;
    }

    public static async Task<IReadOnlyList<string>> ReadErrorsAsync(HttpResponseMessage response)
    {
        var envelope = await ReadAsync(response);
        return ErrorsFromEnvelope(envelope);
    }

    public static IReadOnlyList<string> ErrorsFromEnvelope(ApiEnvelope envelope)
    {
        if (envelope.Data is null)
        {
            return [];
        }

        var errors = envelope.Data.Value.Deserialize<ApiErrorData>(Json);

        return errors?.Errors ?? [];
    }

    private static string Truncate(string value) =>
        value.Length <= 500 ? value : value[..500] + "…";
}
