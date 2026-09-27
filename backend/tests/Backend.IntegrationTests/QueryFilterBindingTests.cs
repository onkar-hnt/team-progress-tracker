using System.Net.Http.Json;
using System.Text.Json;

using Backend.IntegrationTests.Infrastructure;

using Contracts;

using FluentAssertions;

namespace Backend.IntegrationTests;

/// <summary>
/// How a list filter travels on the query string. The frontend joins ids with
/// commas into one parameter, so an endpoint that reads the filter off a
/// <c>[FromQuery]</c> record has to understand that form; before the binder
/// existed, such a record came back as a 400 with no envelope.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class QueryFilterBindingTests(IntegrationTestEnvironment environment)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task A_comma_joined_id_filter_narrows_a_list_to_exactly_those_rows()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var first = await roster.CreateDeveloperAsync(project.Id);
        var second = await roster.CreateDeveloperAsync(project.Id);
        var third = await roster.CreateDeveloperAsync(project.Id);

        const string date = "2026-09-02";

        foreach (var developer in new[] { first, second, third })
        {
            (await roster.AdminTeam.PostAsJsonAsync(
                "/api/leave-days",
                new SaveLeaveDayRequest { DeveloperId = developer.Id, Date = date },
                Json)).EnsureSuccessStatusCode();
        }

        var two = await ListLeaveAsync(roster, date, $"{first.Id},{second.Id}");

        two.Select(row => row.DeveloperId)
            .Should().BeEquivalentTo([first.Id, second.Id]);

        var one = await ListLeaveAsync(roster, date, third.Id.ToString());

        one.Select(row => row.DeveloperId).Should().BeEquivalentTo([third.Id]);
    }

    /// <remarks>
    /// Worth pinning down because it is the surprising half: an empty filter
    /// is not "nobody". <c>AccessScope.RestrictDeveloperIds</c> reads a filter
    /// that narrows to nothing as no narrowing, so the two forms agree.
    /// </remarks>
    [Fact]
    public async Task An_absent_filter_and_an_empty_one_both_read_every_visible_row()
    {
        var roster = await TestRosterBuilder.CreateAdminAsync(environment);
        var project = await roster.CreateProjectAsync();
        var developer = await roster.CreateDeveloperAsync(project.Id);

        const string date = "2026-09-03";

        (await roster.AdminTeam.PostAsJsonAsync(
            "/api/leave-days",
            new SaveLeaveDayRequest { DeveloperId = developer.Id, Date = date },
            Json)).EnsureSuccessStatusCode();

        var unfiltered = await ListLeaveAsync(roster, date, null);

        unfiltered.Select(row => row.DeveloperId).Should().Contain(developer.Id);

        var empty = await ListLeaveAsync(roster, date, string.Empty);

        empty.Select(row => row.DeveloperId).Should().Contain(developer.Id);
    }

    private static async Task<IReadOnlyList<LeaveDayDto>> ListLeaveAsync(
        TestRosterBuilder roster,
        string date,
        string? developerIds)
    {
        var filter = developerIds is null ? string.Empty : $"&developerIds={developerIds}";

        return await ApiEnvelopeReader.ReadDataAsync<IReadOnlyList<LeaveDayDto>>(
            await roster.AdminTeam.GetAsync(
                $"/api/leave-days?dateFrom={date}&dateTo={date}{filter}"));
    }
}
