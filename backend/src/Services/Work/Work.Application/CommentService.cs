using Work.Application.Rules;
using Work.Domain;

namespace Work.Application;

public sealed class CommentService(
    IWorkStore store,
    IAccessScopeProvider scopeProvider,
    ITeamDirectory teamDirectory,
    ICurrentUser currentUser,
    INotificationPublisher notifications,
    FeedbackAuthorStamper authorStamper,
    FeedbackTaskGuard taskGuard,
    WorkBusinessCodeRetry codeRetry)
{
    public async Task<IReadOnlyList<MentorCommentDto>> ListAsync(
        CommentQuery query,
        CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (scope.RestrictDeveloperIds(query.DeveloperIds) is { Count: 0 })
        {
            return [];
        }

        var restricted = query with
        {
            DeveloperIds = scope.RestrictDeveloperIds(query.DeveloperIds),
        };

        var rows = await store.QueryFeedbackAsync(restricted, scope, cancellationToken);

        return [.. rows.Select(WorkMapping.ToDto)];
    }

    public async Task<MentorCommentDto> CreateAsync(
        SaveCommentRequest request,
        CancellationToken cancellationToken)
    {
        await RequireCreatePermissionAsync(request, cancellationToken);
        await ValidateReferencesAsync(request, JsonFieldSet.All, cancellationToken);

        var comment = WorkMapping.FromCommentRequest(request);
        authorStamper.StampOnCreate(comment);
        await taskGuard.GuardAsync(comment, cancellationToken);

        await codeRetry.AllocateAndAddFeedbackAsync(comment, cancellationToken);

        var pending = await new WorkNotificationComposer(currentUser, teamDirectory)
            .ForCommentCreatedAsync(comment, cancellationToken);
        await notifications.PublishAsync(pending, cancellationToken);

        return WorkMapping.ToDto(comment);
    }

    public async Task<MentorCommentDto> UpdateAsync(
        Guid id,
        UpdatePayload<SaveCommentRequest> payload,
        CancellationToken cancellationToken)
    {
        var comment = await store.FindFeedbackAsync(id, cancellationToken)
            ?? throw new NotFoundException("That comment is no longer available.");

        await RequireModifyPermissionAsync(comment, cancellationToken);
        await ValidateReferencesAsync(payload.Request, payload.Fields, cancellationToken);

        WorkMapping.ApplyCommentRequest(payload.Request, payload.Fields, comment);
        await taskGuard.GuardAsync(comment, cancellationToken);
        await store.SaveChangesAsync(cancellationToken);

        return WorkMapping.ToDto(comment);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var comment = await store.FindFeedbackAsync(id, cancellationToken)
            ?? throw new NotFoundException("That comment is no longer available.");

        await RequireModifyPermissionAsync(comment, cancellationToken);
        store.RemoveFeedback(comment);
        await store.SaveChangesAsync(cancellationToken);
    }

    private async Task RequireCreatePermissionAsync(
        SaveCommentRequest request,
        CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (scope.IsAdmin)
        {
            return;
        }

        if (scope.IsMentor
            && currentUser.MentorId == request.MentorId
            && scope.CanViewDeveloper(request.DeveloperId))
        {
            return;
        }

        if (currentUser.Role == DomainRules.RoleDeveloper
            && request.MentorId is null
            && request.TaskId is Guid taskId
            && currentUser.DeveloperId is Guid ownId)
        {
            var task = await store.FindTaskAsync(taskId, cancellationToken)
                ?? throw new ValidationFailedException("Choose a task that exists.");

            if (task.DeveloperId == ownId)
            {
                return;
            }
        }

        throw new ForbiddenException();
    }

    private async Task RequireModifyPermissionAsync(Feedback comment, CancellationToken cancellationToken)
    {
        var scope = await scopeProvider.GetAsync(cancellationToken);

        if (scope.IsAdmin)
        {
            return;
        }

        if (comment.AuthorProfileId is Guid author && author == currentUser.ProfileId)
        {
            return;
        }

        if (comment.AuthorProfileId is null
            && comment.MentorId is Guid mentorId
            && currentUser.MentorId == mentorId)
        {
            return;
        }

        throw new ForbiddenException();
    }

    private async Task ValidateReferencesAsync(
        SaveCommentRequest request,
        JsonFieldSet fields,
        CancellationToken cancellationToken)
    {
        if (fields.Has("developerId")
            && !await teamDirectory.DeveloperExistsAsync(request.DeveloperId, cancellationToken))
        {
            throw new ValidationFailedException("Choose an employee that exists.");
        }

        if (fields.Has("mentorId")
            && request.MentorId is Guid mentorId
            && !await teamDirectory.MentorExistsAsync(mentorId, cancellationToken))
        {
            throw new ValidationFailedException("Choose a mentor that exists.");
        }

        if (fields.Has("projectId")
            && request.ProjectId is Guid projectId
            && !await teamDirectory.ProjectExistsAsync(projectId, cancellationToken))
        {
            throw new ValidationFailedException("Choose a project that exists.");
        }
    }
}
