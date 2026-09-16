using Work.Domain;

namespace Work.Application.Rules;

/// <summary>Replaces Postgres stamp_feedback_author (R6).</summary>
public sealed class FeedbackAuthorStamper(ICurrentUser currentUser)
{
    public void StampOnCreate(Feedback comment)
    {
        comment.AuthorProfileId = currentUser.ProfileId;
        comment.AuthorRole = currentUser.Role;
    }
}
