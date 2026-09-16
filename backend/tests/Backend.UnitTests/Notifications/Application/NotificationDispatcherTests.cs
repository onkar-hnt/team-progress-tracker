using Backend.UnitTests.Fakes;

using Contracts;

using Notifications.Application;

namespace Backend.UnitTests.Notifications.Application;

public sealed class NotificationDispatcherTests
{
    [Fact]
    public async Task PublishPersistsEachNotificationRequest()
    {
        var repository = new FakeNotificationRepository();
        var dispatcher = new NotificationDispatcher(repository);
        var recipient = Guid.CreateVersion7();

        await dispatcher.PublishAsync(
        [
            new NotificationRequest
            {
                RecipientProfileId = recipient,
                Type = DomainRules.NotificationTaskAssigned,
                Title = "Title",
                Message = "Message",
                EntityType = "task",
                EntityId = Guid.CreateVersion7(),
            },
        ],
        CancellationToken.None);

        repository.Added.Should().ContainSingle()
            .Which.RecipientProfileId.Should().Be(recipient);
    }

    [Fact]
    public async Task PublishDoesNotSkipNotificationWhenActorIsTheRecipient()
    {
        var repository = new FakeNotificationRepository();
        var dispatcher = new NotificationDispatcher(repository);
        var profileId = Guid.CreateVersion7();

        await dispatcher.PublishAsync(
        [
            new NotificationRequest
            {
                RecipientProfileId = profileId,
                Type = DomainRules.NotificationDailyUpdateSubmitted,
                Title = "Title",
                Message = "Message",
                EntityType = "daily_update",
                EntityId = Guid.CreateVersion7(),
                ActorProfileId = profileId,
            },
        ],
        CancellationToken.None);

        repository.Added.Should().ContainSingle();
    }
}
