using System.Text.Json;

using Backend.UnitTests.Fakes;

using Contracts;

using Team.Domain;

namespace Backend.UnitTests.Team.Application;

public sealed class RequestApplyPartialUpdateTests
{
    [Fact]
    public void AbsentKeyLeavesStoredDeveloperNameUntouched()
    {
        var row = new Developer { Name = "Original" };
        var fields = JsonFieldSet.From(Parse("{}"));

        TeamRequestApplyInvoker.UpdateDeveloper(
            new SaveDeveloperRequest { Name = "Ignored" },
            fields,
            row);

        row.Name.Should().Be("Original");
    }

    [Fact]
    public void ExplicitNullClearsNullableDeveloperEmail()
    {
        var row = new Developer { Name = "Dev", Email = "old@example.com" };
        var fields = JsonFieldSet.From(Parse("""{"email":null}"""));

        TeamRequestApplyInvoker.UpdateDeveloper(
            new SaveDeveloperRequest { Name = "Dev", Email = null },
            fields,
            row);

        row.Email.Should().BeNull();
    }

    [Fact]
    public void BlankNameIsNotAppliedToDeveloper()
    {
        var row = new Developer { Name = "Original" };
        var fields = JsonFieldSet.From(Parse("""{"name":"   "}"""));

        TeamRequestApplyInvoker.UpdateDeveloper(
            new SaveDeveloperRequest { Name = "   " },
            fields,
            row);

        row.Name.Should().Be("Original");
    }

    [Fact]
    public void EndDateBeforeStartDateOnProjectUpdateThrowsValidationFailed()
    {
        var row = new Project
        {
            Name = "P",
            StartDate = new DateOnly(2026, 6, 1),
            EndDate = new DateOnly(2026, 6, 30),
        };
        var fields = JsonFieldSet.From(Parse("""{"startDate":"2026-06-20","endDate":"2026-06-01"}"""));

        var act = () => TeamRequestApplyInvoker.UpdateProject(
            new SaveProjectRequest
            {
                Name = "P",
                Status = "active",
                StartDate = "2026-06-20",
                EndDate = "2026-06-01",
            },
            fields,
            row);

        act.Should().Throw<ValidationFailedException>()
            .WithMessage("End date cannot be before the start date.");
    }

    private static JsonElement Parse(string json) => JsonDocument.Parse(json).RootElement;
}
