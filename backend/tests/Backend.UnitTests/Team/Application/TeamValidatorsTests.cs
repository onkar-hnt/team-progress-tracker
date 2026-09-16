using Contracts;

using FluentValidation;

using Team.Application;

namespace Backend.UnitTests.Team.Application;

public sealed class TeamValidatorsTests
{
    [Fact]
    public void ProjectEndDateBeforeStartDateIsRejected()
    {
        var request = new SaveProjectRequest
        {
            Name = "Website",
            Status = "active",
            StartDate = "2026-06-15",
            EndDate = "2026-06-01",
        };

        var result = new SaveProjectRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error =>
            error.ErrorMessage == "End date cannot be before the start date.");
    }

    [Fact]
    public void PartialDeveloperUpdateDoesNotValidateNameWhenKeyWasNotSent()
    {
        var payload = new UpdatePayload<SaveDeveloperRequest>(
            new SaveDeveloperRequest { Name = "  " },
            JsonFieldSet.From(System.Text.Json.JsonDocument.Parse("{}").RootElement));

        var result = new DeveloperUpdatePayloadValidator().Validate(payload);

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void BadCreatedDateStringIsRejectedForDeveloper()
    {
        var request = new SaveDeveloperRequest
        {
            Name = "Dev",
            CreatedDate = "not-a-date",
        };

        var result = new SaveDeveloperRequestValidator().Validate(request);

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error =>
            error.ErrorMessage == "Created date must be a date like 2026-09-16.");
    }
}
