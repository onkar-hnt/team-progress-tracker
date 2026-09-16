using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

using Contracts;

namespace Backend.IntegrationTests.Infrastructure;

public static class AuthClientFactory
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task<(HttpClient Client, SignInResponse Session)> SignInAsync(
        HttpClient identityClient,
        string email,
        string password)
    {
        var response = await identityClient.PostAsJsonAsync(
            "/api/auth/login",
            new SignInRequest { Email = email, Password = password },
            Json);

        response.EnsureSuccessStatusCode();
        var session = await ApiEnvelopeReader.ReadDataAsync<SignInResponse>(response);

        var client = identityClient;
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", session.AccessToken);

        return (client, session);
    }

    public static HttpClient Authorize(HttpClient client, string accessToken)
    {
        var authorised = client;
        authorised.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", accessToken);

        return authorised;
    }

    public static HttpClient CloneAuthorised(HttpClient template, HttpClient bareClient)
    {
        var token = template.DefaultRequestHeaders.Authorization?.Parameter;

        if (string.IsNullOrEmpty(token))
        {
            throw new InvalidOperationException("Template client has no bearer token.");
        }

        return Authorize(bareClient, token);
    }
}
