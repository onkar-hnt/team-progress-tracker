using Contracts;

using FluentValidation;

using Notifications.Application;

namespace Backend.UnitTests.Notifications.Application;

public sealed class NotificationPreferencesValidatorTests
{
    private readonly NotificationPreferencesDtoValidator _validator = new();

    [Fact]
    public void KnownNotificationTypeMayBeMuted()
    {
        var result = _validator.Validate(new NotificationPreferencesDto
        {
            MutedNotificationTypes = [DomainRules.NotificationWorkBlocked],
        });

        result.IsValid.Should().BeTrue();
    }

    [Fact]
    public void UnknownNotificationTypeCannotBeMuted()
    {
        var result = _validator.Validate(new NotificationPreferencesDto
        {
            MutedNotificationTypes = ["not_a_real_type"],
        });

        result.IsValid.Should().BeFalse();
        result.Errors.Should().Contain(error =>
            error.ErrorMessage == "That is not a notification type you can mute.");
    }
}
