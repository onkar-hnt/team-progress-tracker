namespace Backend.IntegrationTests.Infrastructure;

internal static class HttpClientExtensions
{
    public static Task<HttpResponseMessage> PostEmptyAsync(this HttpClient client, string requestUri) =>
        client.PostAsync(requestUri, null);
}
