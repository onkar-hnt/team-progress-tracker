using Reporting.Domain;

namespace Backend.UnitTests.Reporting.Domain;

public sealed class ReportPeriodTests
{
    [Fact]
    public void ResolveUsesExplicitBoundsWhenBothProvided()
    {
        var period = ReportPeriod.Resolve("2026-01-01", "2026-01-31");

        period.From.Should().Be(new DateOnly(2026, 1, 1));
        period.To.Should().Be(new DateOnly(2026, 1, 31));
    }

    [Fact]
    public void InvertedRangeThrowsValidationFailedException()
    {
        var act = () => ReportPeriod.Resolve("2026-06-30", "2026-06-01");

        act.Should().Throw<ValidationFailedException>()
            .WithMessage("'from' must be on or before 'to'.");
    }
}
