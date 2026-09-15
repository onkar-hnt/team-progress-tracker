import { Link, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { Panel } from '@components/ui/panel/Panel'
import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import { useAccessScope } from '@hooks/use-access-scope'
import { useCreateComment, useTask, useTaskComments } from '@hooks/use-work-tracker'
import { canCommentOnTask } from '@services/auth/index'
import type { AssignedTaskView } from '@services/work-tracker.service'
import { formatLongDate, todayIsoDate } from '@utils/date.utils'
import { compareEffort, describeEffort } from '@utils/task.utils'

import { TaskCommentTrail } from '../components/TaskCommentTrail'

import './TaskDetailsPage.scss'

/**
 * One task, and the conversation on it.
 *
 * The same screen for everybody who may open the task: a developer reading
 * their own work, a mentor reading the work of somebody assigned to them, an
 * administrator reading anything. Access is decided by the query — the service
 * returns null for a task outside the reader's scope — so there is no separate
 * route guard to keep in step with the database.
 */
export function TaskDetailsPage() {
  const { taskId = '' } = useParams<{ taskId: string }>()
  const { user } = useAuth()
  const { scope } = useAccessScope()
  const snackbar = useSnackbar()

  const taskQuery = useTask(taskId)
  const commentsQuery = useTaskComments(taskId)
  const createComment = useCreateComment()

  const task = taskQuery.data ?? null

  const addComment = async (comment: string): Promise<boolean> => {
    if (task === null || user === null) return false

    // Attributed to the mentor writing it, which is also what feedback_insert
    // matches on. A developer's reply is attributed to nobody.
    const mentorId = user.role === 'developer' ? undefined : user.mentorId

    const isSaved = await createComment
      .mutateAsync({
        developerId: task.developerId,
        taskId: task.id,
        projectId: task.projectId,
        date: todayIsoDate(),
        comment,
        ...(mentorId === undefined ? {} : { mentorId }),
      })
      .then(() => true)
      .catch(() => false)

    if (isSaved) {
      snackbar.success(
        user.role === 'developer' ? 'Your update was added.' : 'Your comment was added.',
      )
    }

    return isSaved
  }

  if (taskQuery.error !== null) {
    return (
      <div className="task-details">
        <Panel isPageHeading title="Task">
          <ErrorState
            message={`This task could not be loaded: ${taskQuery.error.message}`}
            onRetry={() => void taskQuery.refetch()}
          />
        </Panel>
      </div>
    )
  }

  // Same wording whether the task is gone or belongs to somebody out of reach.
  if (!taskQuery.isPending && task === null) {
    return (
      <PagePlaceholder
        action={<Link to="/my-tasks">Back to tasks</Link>}
        description="This task does not exist, or it belongs to somebody outside the people you work with."
        title="Task not available"
      />
    )
  }

  const canComment = task !== null && canCommentOnTask(user, scope, task)

  return (
    <div className="task-details">
      <Panel
        description={task === null ? undefined : `${task.projectName} · ${task.developerName}`}
        isPageHeading
        title={task?.name ?? 'Task'}
      >
        {task === null ? (
          <Skeleton label="Loading this task…" rows={3} />
        ) : (
          <>
            <dl className="task-details__facts">
              <Fact label="Status">
                <StatusBadge status={task.status} />
              </Fact>
              <Fact label="Priority">
                <PriorityBadge priority={task.priority} />
              </Fact>
              <Fact label="Developer">{task.developerName}</Fact>
              <Fact label="Project">{task.projectName}</Fact>
              <Fact label="Mentor">{task.mentorName ?? 'Unassigned'}</Fact>
              <Fact label="Started">{formatLongDate(task.createdDate)}</Fact>
              <Fact label="Due">
                {task.dueDate === undefined
                  ? 'No due date'
                  : `${formatLongDate(task.dueDate)}${task.isOverdue ? ' · overdue' : ''}`}
              </Fact>
              <Fact label="Estimated">
                {task.estimatedHours === undefined
                  ? 'Not estimated'
                  : `${String(task.estimatedHours)} h`}
              </Fact>
              <Fact label="Time taken">
                <Effort task={task} />
              </Fact>
            </dl>

            {task.description === undefined ? null : (
              <p className="task-details__description">{task.description}</p>
            )}
          </>
        )}
      </Panel>

      <Panel
        description={
          canComment
            ? 'Oldest first, so the conversation reads in order.'
            : 'Oldest first. Comments are added by the developer and their mentor.'
        }
        fills={(commentsQuery.data ?? []).length > 0}
        title="Comments & feedback"
      >
        {commentsQuery.error !== null ? (
          <ErrorState
            message={`The comments could not be loaded: ${commentsQuery.error.message}`}
            onRetry={() => void commentsQuery.refetch()}
          />
        ) : commentsQuery.isPending ? (
          <Skeleton label="Loading comments…" rows={3} />
        ) : (
          <TaskCommentTrail
            authorRole={user?.role ?? 'developer'}
            canComment={canComment}
            comments={commentsQuery.data ?? []}
            isSubmitting={createComment.isPending}
            onAddComment={addComment}
          />
        )}
      </Panel>
    </div>
  )
}

/**
 * Days logged, the hours they come to, and how that sits against the estimate.
 *
 * The days are said first because they are what was observed: the hours are
 * those days at a standard working day, which is an assumption the reader is
 * entitled to see the workings of.
 */
function Effort({ task }: { task: AssignedTaskView }) {
  if (task.workedDays === 0) return <>No days logged yet</>

  const days = `${String(task.workedDays)} ${task.workedDays === 1 ? 'day' : 'days'}`
  const comparison = compareEffort(task)

  return (
    <>
      {days} · {String(task.actualHours)} h
      {comparison === null ? null : (
        <span className={`task-details__effort task-details__effort--${comparison.verdict}`}>
          {describeEffort(comparison)}
        </span>
      )}
    </>
  )
}

function Fact({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="task-details__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
