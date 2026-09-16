import { useMemo, useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { ShowMore } from '@components/ui/show-more/ShowMore'
import { usePaging } from '@hooks/use-paging'
import {
  useActiveDevelopers,
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from '@hooks/use-work-tracker'
import type { MentorComment } from '@models/index'
import { canEditComment, canWriteFeedback } from '@services/auth/index'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import { formatLongDate } from '@utils/date.utils'

import { CommentTimeline } from '../components/CommentTimeline'
import { FeedbackForm } from '../components/FeedbackForm'
import { toCreateCommentRequest } from '../schemas/feedback.schema'
import type { FeedbackFormValues } from '../schemas/feedback.schema'

import './FeedbackPage.scss';

const FEEDBACK_PAGE_SIZE = 25

export function FeedbackPage() {
  const { user } = useAuth()

  return canWriteFeedback(user) ? <FeedbackWorkspace /> : <OwnFeedback />
}

function OwnFeedback() {
  const paging = usePaging(FEEDBACK_PAGE_SIZE)
  const commentsQuery = useComments({ limit: paging.limit })
  const page = paging.apply(commentsQuery.data)

  return (
    <div className="feedback-page">
      <Panel
        description="One entry per task, most recently discussed first. Open a task to reply or add an update."
        fills={page.records.length > 0}
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
          <>
            <CommentTimeline
              comments={page.records}
              emptyMessage="No feedback has been recorded about your work yet."
              showDeveloper={false}
            />

            {page.hasMore ? (
              <ShowMore
                isLoading={commentsQuery.isFetching}
                noun="comments"
                onShowMore={paging.showMore}
                pageSize={paging.pageSize}
                shown={page.records.length}
              />
            ) : null}
          </>
        )}
      </Panel>
    </div>
  )
}

function FeedbackWorkspace() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const snackbar = useSnackbar()

  const [developerFilter, setDeveloperFilter] = useState('')
  const [editing, setEditing] = useState<MentorComment | null>(null)

  const developersQuery = useActiveDevelopers()

  const paging = usePaging(FEEDBACK_PAGE_SIZE, developerFilter)

  const query = useMemo(
    () => ({
      ...(developerFilter === '' ? {} : { developerIds: [developerFilter] }),
      limit: paging.limit,
    }),
    [developerFilter, paging.limit],
  )

  const commentsQuery = useComments(query)
  const page = paging.apply(commentsQuery.data)

  const createComment = useCreateComment()
  const updateComment = useUpdateComment()
  const deleteComment = useDeleteComment()

  const mentorId = user?.mentorId ?? ''

  const handleCreate = async (values: FeedbackFormValues, projectId: string | undefined) => {
    await createComment.mutateAsync(toCreateCommentRequest(values, mentorId, projectId))
    snackbar.success('The feedback was saved.')
  }

  const handleUpdate = async (values: FeedbackFormValues, projectId: string | undefined) => {
    if (editing === null) return

    await updateComment.mutateAsync({
      id: editing.id,
      changes: toCreateCommentRequest(values, editing.mentorId ?? mentorId, projectId),
    })

    setEditing(null)
    snackbar.success('The feedback was saved.')
  }

  const requestDelete = async (comment: MentorComment) => {
    const isDeleted = await confirm({
      title: 'Delete this feedback?',
      message: `The feedback recorded on ${formatLongDate(comment.date)} will be removed from the developer's history. ${describeDeleteOutcome()}`,
      confirmLabel: 'Delete feedback',
      isDestructive: true,
      action: () => deleteComment.mutateAsync(comment.id),
    })

    if (isDeleted) snackbar.success('The feedback was deleted.')
  }

  const developerPicker = (
    <label className="feedback-page__filter">
      <span>Developer</span>
      <Dropdown
        ariaLabel="Developer"
        onChange={setDeveloperFilter}
        options={[
          { value: '', label: 'All developers' },
          ...(developersQuery.data ?? []).map((developer) => ({
            value: developer.id,
            label: developer.name,
          })),
        ]}
        value={developerFilter}
      />
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
        <FeedbackForm onSubmit={handleCreate} />
      </Panel>

      <Panel
        action={developerPicker}
        description="One entry per task, most recently discussed first. Open a task to add a comment."
        fills={page.records.length > 0}
        title="Feedback history"
      >
        {commentsQuery.error !== null ? (
          <ErrorState
            message={`Feedback could not be loaded: ${commentsQuery.error.message}`}
            onRetry={() => void commentsQuery.refetch()}
          />
        ) : commentsQuery.isPending ? (
          <Skeleton label="Loading feedback…" rows={4} />
        ) : (
          <>
            <CommentTimeline
              comments={page.records}
              emptyMessage="No feedback has been recorded yet."
              renderActions={(comment) =>
                canEditComment(user, comment) ? (
                  <div className="row-actions">
                    <Button
                      onClick={() => {
                        updateComment.reset()
                        setEditing(comment)
                      }}
                      size="small"
                      variant="ghost"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => void requestDelete(comment)}
                      size="small"
                      variant="danger"
                    >
                      Delete
                    </Button>
                  </div>
                ) : null
              }
            />

            {page.hasMore ? (
              <ShowMore
                isLoading={commentsQuery.isFetching}
                noun="comments"
                onShowMore={paging.showMore}
                pageSize={paging.pageSize}
                shown={page.records.length}
              />
            ) : null}
          </>
        )}
      </Panel>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit feedback">
        {editing === null ? null : (
          <FeedbackForm
            comment={editing}
            onCancel={() => setEditing(null)}
            onSubmit={handleUpdate}
          />
        )}
      </Modal>
    </div>
  )
}
