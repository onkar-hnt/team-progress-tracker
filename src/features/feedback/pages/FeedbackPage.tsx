import { useMemo, useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import {
  useActiveDevelopers,
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from '@hooks/use-work-tracker'
import type { MentorComment } from '@models/index'
import { canEditComment, canWriteFeedback } from '@services/auth/index'

import { CommentTimeline } from '../components/CommentTimeline'
import { FeedbackForm } from '../components/FeedbackForm'
import { toCreateCommentRequest } from '../schemas/feedback.schema'
import type { FeedbackFormValues } from '../schemas/feedback.schema'

import './FeedbackPage.scss'

/**
 * The feedback screen, in the form that suits the person opening it.
 *
 * Two components rather than one with branches throughout: a developer's view
 * needs neither the write mutations nor the roster query, and splitting them
 * means it does not carry those requests just to hide their results.
 */
export function FeedbackPage() {
  const { user } = useAuth()

  return canWriteFeedback(user) ? <FeedbackWorkspace /> : <OwnFeedback />
}

/**
 * What a developer sees: the feedback written about them, and nothing else.
 *
 * `useComments` needs no filter. The access scope narrows the query to the
 * signed-in developer, and `feedback_select` enforces the same limit in the
 * database, so asking for everything returns only their own record.
 */
function OwnFeedback() {
  const commentsQuery = useComments()

  return (
    <div className="feedback-page">
      <Panel
        description="What your mentor has recorded against your tasks. Newest first."
        isPageHeading
        title="My feedback"
      >
        {commentsQuery.error !== null ? (
          <ErrorState
            message={`Feedback could not be loaded: ${commentsQuery.error.message}`}
            onRetry={() => void commentsQuery.refetch()}
          />
        ) : commentsQuery.isPending ? (
          <Skeleton label="Loading feedback…" rows={4} />
        ) : (
          // No actions and no developer name: every entry here is about the
          // person reading it, and none of it is theirs to edit.
          <CommentTimeline
            comments={commentsQuery.data ?? []}
            emptyMessage="No feedback has been recorded about your work yet."
            showDeveloper={false}
          />
        )}
      </Panel>
    </div>
  )
}

/**
 * Where mentors record and review feedback.
 *
 * The developer filter lists only people in scope, so a mentor's view is
 * limited to their own developers without this screen checking anything.
 */
function FeedbackWorkspace() {
  const { user } = useAuth()
  const [developerFilter, setDeveloperFilter] = useState('')
  const [editing, setEditing] = useState<MentorComment | null>(null)

  const developersQuery = useActiveDevelopers()
  const query = useMemo(
    () => (developerFilter === '' ? undefined : { developerIds: [developerFilter] }),
    [developerFilter],
  )
  const commentsQuery = useComments(query)

  const createComment = useCreateComment()
  const updateComment = useUpdateComment()
  const deleteComment = useDeleteComment()

  // An admin writing feedback is recorded against their own mentor row where
  // they have one; without it there is nobody to attribute the note to.
  const mentorId = user?.mentorId ?? ''

  const handleCreate = async (values: FeedbackFormValues, projectId: string | undefined) => {
    await createComment.mutateAsync(toCreateCommentRequest(values, mentorId, projectId))
  }

  // Re-attributing somebody else's feedback by editing it would rewrite who
  // said it, so the original mentor is kept.
  const handleUpdate = async (values: FeedbackFormValues, projectId: string | undefined) => {
    if (editing === null) return

    await updateComment.mutateAsync({
      id: editing.id,
      changes: toCreateCommentRequest(values, editing.mentorId, projectId),
    })
    setEditing(null)
  }

  const developerPicker = (
    <label className="feedback-page__filter">
      <span>Developer</span>
      <select
        onChange={(event) => setDeveloperFilter(event.target.value)}
        value={developerFilter}
      >
        <option value="">All developers</option>
        {(developersQuery.data ?? []).map((developer) => (
          <option key={developer.id} value={developer.id}>
            {developer.name}
          </option>
        ))}
      </select>
    </label>
  )

  if (mentorId === '') {
    return (
      <div className="feedback-page">
        <Panel
          description="Feedback is attributed to a mentor record."
          isPageHeading
          title="Feedback"
        >
          <ErrorState message="Your account is not linked to a mentor record, so feedback cannot be attributed. Ask an administrator to add you to the Mentors sheet." />
        </Panel>
      </div>
    )
  }

  return (
    <div className="feedback-page">
      <Panel
        description="Feedback is recorded against one of the developer's tasks, so they can see which piece of work it is about."
        isPageHeading
        title="Feedback"
      >
        <FeedbackForm
          error={createComment.error === null ? null : createComment.error.message}
          onSubmit={handleCreate}
        />
      </Panel>

      <Panel action={developerPicker} description="Newest first." title="Feedback history">
        {commentsQuery.error !== null ? (
          <ErrorState
            message={`Feedback could not be loaded: ${commentsQuery.error.message}`}
            onRetry={() => void commentsQuery.refetch()}
          />
        ) : commentsQuery.isPending ? (
          <Skeleton label="Loading feedback…" rows={4} />
        ) : (
          <CommentTimeline
            comments={commentsQuery.data ?? []}
            emptyMessage="No feedback has been recorded yet."
            renderActions={(comment) =>
              canEditComment(user, comment) ? (
                <div className="row-actions">
                  <button
                    className="button button--ghost button--small"
                    onClick={() => {
                      updateComment.reset()
                      setEditing(comment)
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="button button--danger button--small"
                    onClick={() => {
                      // Deleting feedback removes part of somebody's record,
                      // so it is confirmed rather than immediate.
                      if (window.confirm('Delete this feedback? This cannot be undone.')) {
                        deleteComment.mutate(comment.id)
                      }
                    }}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              ) : null
            }
          />
        )}
      </Panel>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit feedback">
        {editing === null ? null : (
          <FeedbackForm
            comment={editing}
            error={updateComment.error === null ? null : updateComment.error.message}
            onCancel={() => setEditing(null)}
            onSubmit={handleUpdate}
          />
        )}
      </Modal>
    </div>
  )
}
