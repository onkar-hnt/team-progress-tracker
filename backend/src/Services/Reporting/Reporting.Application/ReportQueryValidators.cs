using FluentValidation;

using Reporting.Domain;

using SharedKernel;

namespace Reporting.Application;

public sealed class ReportDateRangeQueryValidator : AbstractValidator<ReportDateRangeQuery>
{
    public ReportDateRangeQueryValidator()
    {
        RuleFor(query => query)
            .Custom((query, context) => ReportDateRangeRules.Validate(query.From, query.To, context.AddFailure));
    }
}

public sealed class ScopedReportQueryValidator : AbstractValidator<ScopedReportQuery>
{
    public ScopedReportQueryValidator()
    {
        RuleFor(query => query)
            .Custom((query, context) => ReportDateRangeRules.Validate(query.From, query.To, context.AddFailure));
    }
}

internal static class ReportDateRangeRules
{
    internal static void Validate(string? from, string? to, Action<string> addFailure)
    {
        var datesValid = true;

        if (!string.IsNullOrWhiteSpace(from)
            && !DateOnly.TryParseExact(
                from,
                DateStrings.DateFormat,
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None,
                out _))
        {
            addFailure("from must be a date like 2026-09-16.");
            datesValid = false;
        }

        if (!string.IsNullOrWhiteSpace(to)
            && !DateOnly.TryParseExact(
                to,
                DateStrings.DateFormat,
                System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None,
                out _))
        {
            addFailure("to must be a date like 2026-09-16.");
            datesValid = false;
        }

        if (!datesValid)
        {
            return;
        }

        try
        {
            var period = ReportPeriod.Resolve(from, to);

            if (period.To.DayNumber - period.From.DayNumber > 366)
            {
                addFailure("The date range cannot be longer than 366 days.");
            }
        }
        catch (ValidationFailedException ex)
        {
            addFailure(ex.Message);
        }
    }
}
