using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

namespace Backend.IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class ValidationAndErrorHandlingTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task Signing_in_without_a_password_returns_a_validation_message_without_technical_detail()
    {
        var response = await environment.IdentityClient().PostAsJsonAsync(
            "/api/auth/login",
            new SignInRequest { Email = TestConfiguration.AdminEmail, Password = "" },
            Json);

        var envelope = await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.BadRequest);
        var body = await response.Content.ReadAsStringAsync();

        envelope.Message.Should().NotBeNullOrWhiteSpace();
        body.Should().NotContain("SqlException");
        body.Should().NotContain("StackTrace");
    }

    [Fact]
    public async Task Creating_an_employee_without_a_name_is_refused_with_field_guidance()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);

        var response = await roster.AdminTeam.PostAsJsonAsync(
            "/api/developers",
            new SaveDeveloperRequest { Name = "" },
            Json);

        var envelope = await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.BadRequest);
        var errors = ApiEnvelopeReader.ErrorsFromEnvelope(envelope);

        envelope.Message.Should().Contain("correct");
        errors.Should().NotBeEmpty();
    }

    [Fact]
    public async Task An_unauthenticated_request_to_a_protected_route_returns_the_standard_envelope()
    {
        var response = await environment.TeamClient().GetAsync("/api/developers");

        var envelope = await ApiEnvelopeReader.ExpectFailureAsync(response, HttpStatusCode.Unauthorized);
        envelope.Message.Should().Be("Please sign in again.");
    }
}
