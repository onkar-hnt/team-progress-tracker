namespace Backend.UnitTests.Fakes;

internal sealed class FakeCurrentUser : ICurrentUser
{
    public bool IsAuthenticated { get; init; } = true;
    public Guid ProfileId { get; init; } = Guid.CreateVersion7();
    public string Email { get; init; } = "user@example.com";
    public string Role { get; init; } = DomainRules.RoleDeveloper;
    public Guid? DeveloperId { get; init; }
    public Guid? MentorId { get; init; }
}
