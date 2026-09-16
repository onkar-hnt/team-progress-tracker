using FluentValidation;

using Reporting.Application;

namespace Backend.UnitTests.Reporting.Application;

public sealed class ReportQueryValidatorsTests
{
    [Fact]
    public void InvalidFromDateIsRejected()
    {
        var result = new ReportDateRangeQueryValidator().Validate(new ReportDateRangeQuery
        {
            From = "31/01/2026",
            To = "2026-01-31",
        });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage == "from must be a date like 2026-09-16.");
    }

    [Fact]
    public void InvertedRangeIsRejectedAfterDatesParse()
    {
        var result = new ReportDateRangeQueryValidator().Validate(new ReportDateRangeQuery
        {
            From = "2026-06-30",
            To = "2026-06-01",
        });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error => error.ErrorMessage == "'from' must be on or before 'to'.");
    }

    [Fact]
    public void RangeLongerThan366DaysIsRejected()
    {
        var result = new ReportDateRangeQueryValidator().Validate(new ReportDateRangeQuery
        {
            From = "2024-01-01",
            To = "2025-01-02",
        });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error =>
            error.ErrorMessage == "The date range cannot be longer than 366 days.");
    }
}
