namespace Backend.UnitTests.SharedKernel;

public sealed class DomainRulesProgressForStatusTests
{
    [Theory]
    [InlineData(DomainRules.TaskCompleted, 100)]
    [InlineData(DomainRules.TaskNotStarted, 0)]
    public void FixedProgressIsImpliedForTerminalStatuses(string status, int expected)
    {
        DomainRules.ProgressForStatus(status).Should().Be(expected);
    }

    [Theory]
    [InlineData(DomainRules.TaskInProgress)]
    [InlineData(DomainRules.TaskBlocked)]
    public void InProgressAndBlockedAllowAnyProgress(string status)
    {
        DomainRules.ProgressForStatus(status).Should().BeNull();
    }
}
