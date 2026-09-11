import type { ReactNode } from 'react'

import { EmptyState } from '@components/ui/feedback/Feedback'
import type { MentorCommentView } from '@services/work-tracker.service'
import { formatLongDate } from '@utils/date.utils'

import './CommentTimeline.scss'

interface CommentTimelineProps {
  comments: readonly MentorCommentView[]
  emptyMessage: string

  /** Hidden on a single developer's page, where every entry is about them. */
  showDeveloper?: boolean

  renderActions?: (comment: MentorCommentView) => ReactNode
}

/**
 * Mentor feedback as a dated timeline.
 *
 * A timeline rather than a table because feedback is read as a narrative —
 * what was said, when, and how it followed on — and the optional fields
 * (progress, blockers, recommendations) are often empty, which would leave a
 * table mostly blank.
 */
export function CommentTimeline({
  comments,
  emptyMessage,
  renderActions,
  showDeveloper = true,
}: CommentTimelineProps) {
  if (comments.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <ol className="comment-timeline">
      {comments.map((comment) => (
        <li className="comment-timeline__item" key={comment.id}>
          <div className="comment-timeline__header">
            <div>
              {/* The task leads, because it is what the note is about; who
                  said it and when are the qualifiers. Feedback recorded
                  before it was task-scoped has none, and falls back to the
                  project it named instead. */}
              <p className="comment-timeline__task">
                {comment.taskName ?? comment.projectName ?? 'General feedback'}
              </p>
              <p className="comment-timeline__meta">
                <time dateTime={comment.date}>{formatLongDate(comment.date)}</time>
                {' · '}
                {comment.mentorName}
                {comment.taskName === undefined || comment.projectName === undefined
                  ? ''
                  : ` · ${comment.projectName}`}
              </p>
              {showDeveloper ? (
                <p className="comment-timeline__developer">{comment.developerName}</p>
              ) : null}
            </div>

            {renderActions === undefined ? null : (
              <div className="comment-timeline__actions">{renderActions(comment)}</div>
            )}
          </div>

          <p className="comment-timeline__comment">{comment.comment}</p>

          <CommentDetail label="Progress" value={comment.progressUpdate} />
          <CommentDetail label="Blockers" value={comment.blockers} />
          <CommentDetail label="Recommendations" value={comment.recommendations} />
        </li>
      ))}
    </ol>
  )
}

/** Optional fields are omitted entirely rather than shown with a dash. */
function CommentDetail({ label, value }: { label: string; value?: string }) {
  if (value === undefined || value.trim() === '') return null

  return (
    <p className="comment-timeline__detail">
      <span className="comment-timeline__detail-label">{label}</span>
      {value}
    </p>
  )
}
