namespace Backend.UnitTests.SharedKernel;

public sealed class DateStringsTests
{
    [Fact]
    public void CalendarDateFormatsAsYyyyMmDd()
    {
        DateStrings.From(new DateOnly(2026, 9, 16)).Should().Be("2026-09-16");
    }

    [Fact]
    public void NullableCalendarDateNullStaysNull()
    {
        DateStrings.From((DateOnly?)null).Should().BeNull();
    }

    [Fact]
    public void TimestampFormatsAsIso8601UtcWithMilliseconds()
    {
        var moment = new DateTimeOffset(2026, 9, 16, 14, 30, 0, 500, TimeSpan.FromHours(5.5));

        DateStrings.From(moment).Should().Be("2026-09-16T09:00:00.500Z");
    }

    [Fact]
    public void ParseDateAcceptsYyyyMmDd()
    {
        DateStrings.ParseDate("2026-09-16", "Start date")
            .Should().Be(new DateOnly(2026, 9, 16));
    }

    [Fact]
    public void ParseDateRejectsMalformedValue()
    {
        var act = () => DateStrings.ParseDate("16/09/2026", "Start date");

        act.Should().Throw<ValidationFailedException>()
            .WithMessage("Start date must be a date like 2026-09-16.");
    }

    [Fact]
    public void ParseOptionalDateTreatsBlankAsNull()
    {
        DateStrings.ParseOptionalDate("  ", "End date").Should().BeNull();
    }
}
