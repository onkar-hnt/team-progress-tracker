using Contracts;

using FluentValidation;

using SharedKernel;

namespace Notifications.Application;

public sealed class NotificationPreferencesDtoValidator : AbstractValidator<NotificationPreferencesDto>
{
    public NotificationPreferencesDtoValidator()
    {
        RuleForEach(dto => dto.MutedNotificationTypes)
            .Must(type => DomainRules.NotificationTypes.Contains(type))
            .WithMessage("That is not a notification type you can mute.");
    }
}
