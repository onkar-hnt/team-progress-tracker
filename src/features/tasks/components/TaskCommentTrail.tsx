import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@components/ui/button/Button'
import { EmptyState } from '@components/ui/feedback/Feedback'
import { TextAreaField } from '@components/ui/field/Field'
import type { CommentAuthorRole } from '@models/index'
import { USER_ROLE_LABELS } from '@models/user.model'
import type { MentorCommentView } from '@services/work-tracker.service'
import { formatRelativeTime, formatTimestamp } from '@utils/date.utils'
import { initialsOf } from '@utils/name.utils'

import { COMMENT_MAX_LENGTH, commentTextSchema } from '@features/feedback/schemas/feedback.schema'

import './TaskCommentTrail.scss'

/**
 * The conversation on one task, and the box for adding to it.
 *
 * Shared by whoever opens a task, rather than written per role: the entries are
 * the same for everybody who may read them, and the only thing the role decides
 * is how the composer is worded and whether it appears at all.
 */
interface TaskCommentTrailProps {
  /** Oldest first; the caller sorts, because the query owns the ordering. */
  comments: readonly MentorCommentView[]

  /** The capacity the reader would write in, which the composer is worded for. */
  authorRole: CommentAuthorRole

  canComment: boolean
  isSubmitting: boolean

  /** Resolves true when the entry was saved, which is when the box is cleared. */
  onAddComment: (comment: string) => Promise<boolean>

  /** Per-entry controls, for the screen where an author may amend their own. */
  renderActions?: (comment: MentorCommentView) => ReactNode
}

const COMPOSER: Readonly<
  Record<CommentAuthorRole, { label: string; placeholder: string; submit: string }>
> = {
  admin: {
    label: 'Add a comment',
    placeholder: 'Write your comment…',
    submit: 'Add comment',
  },
  mentor: {
    label: 'Add feedback or a comment',
    placeholder: 'Write your feedback…',
    submit: 'Add comment',
  },
  developer: {
    label: 'Add an update or reply',
    placeholder: 'Write your update…',
    submit: 'Add update',
  },
}

export function TaskCommentTrail({
  authorRole,
  canComment,
  comments,
  isSubmitting,
  onAddComment,
  renderActions,
}: TaskCommentTrailProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)

  const composer = COMPOSER[authorRole]
  const isEmpty = draft.trim() === ''

  const submit = async () => {
    const checked = commentTextSchema.safeParse(draft)

    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? 'That comment could not be saved.')
      return
    }

    const isSaved = await onAddComment(checked.data)
    if (!isSaved) return

    setDraft('')
    setError(undefined)
  }

  return (
    <div className="task-trail">
      {comments.length === 0 ? (
        <EmptyState
          icon="comments"
          message="Mentor comments and developer updates will appear here, oldest first."
          title="No comments yet"
        />
      ) : (
        <ol className="task-trail__entries">
          {comments.map((comment) => (
            <TrailEntry
              actions={renderActions?.(comment)}
              comment={comment}
              key={comment.id}
            />
          ))}
        </ol>
      )}

      {canComment ? (
        <form
          className="task-trail__composer"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <TextAreaField
            error={error}
            id="task-comment"
            isWide
            label={composer.label}
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(event) => {
              setDraft(event.target.value)
              if (error !== undefined) setError(undefined)
            }}
            placeholder={composer.placeholder}
            rows={3}
            value={draft}
          />

          <div className="task-trail__actions">
            <p className="task-trail__count">
              {draft.trim().length} / {COMMENT_MAX_LENGTH}
            </p>

            <Button
              disabled={isEmpty || isSubmitting}
              isLoading={isSubmitting}
              type="submit"
              variant="primary"
            >
              {isSubmitting ? 'Saving…' : composer.submit}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}

function TrailEntry({ actions, comment }: { actions?: ReactNode; comment: MentorCommentView }) {
  return (
    <li className={`task-trail__entry task-trail__entry--${comment.authorRole}`}>
      <div className="task-trail__header">
        <span aria-hidden="true" className="task-trail__avatar">
          {initialsOf(comment.authorName)}
        </span>

        <div className="task-trail__who">
          <span className="task-trail__author">{comment.authorName}</span>
          <span className="task-trail__role">{USER_ROLE_LABELS[comment.authorRole]}</span>
        </div>

        <time
          className="task-trail__time"
          dateTime={comment.createdAt}
          title={formatTimestamp(comment.createdAt)}
        >
          {formatRelativeTime(comment.createdAt)}
        </time>

        {actions === undefined ? null : <div className="task-trail__entry-actions">{actions}</div>}
      </div>

      <p className="task-trail__body">{comment.comment}</p>

      <TrailDetail label="Progress" value={comment.progressUpdate} />
      <TrailDetail label="Blockers" value={comment.blockers} />
      <TrailDetail label="Recommendations" value={comment.recommendations} />
    </li>
  )
}

/** Older feedback carried these as separate fields; entries added here do not. */
function TrailDetail({ label, value }: { label: string; value?: string }) {
  if (value === undefined || value.trim() === '') return null

  return (
    <p className="task-trail__detail">
      <span className="task-trail__detail-label">{label}</span>
      {value}
    </p>
  )
}
