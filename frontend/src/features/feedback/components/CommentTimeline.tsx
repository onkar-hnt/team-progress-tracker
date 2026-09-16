import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@components/ui/feedback/Feedback'
import type { MentorCommentView } from '@services/work-tracker.service'
import { formatLongDate } from '@utils/date.utils'

import { TaskCommentTrail } from '@features/tasks/components/TaskCommentTrail'

import './CommentTimeline.scss'

/**
 * Feedback grouped into one entry per task.
 *
 * A task is one conversation however many times it has been written on, so the
 * five comments on it are five lines in a single card rather than five cards
 * repeating the same heading. The card is a reader: replying happens on the
 * task, which is where the work being discussed is, so the heading is a link
 * and there is no second composer to keep in step with the one there.
 */
interface CommentTimelineProps {
  /** Newest first, as the query returns them. */
  comments: readonly MentorCommentView[]

  emptyMessage: string
  showDeveloper?: boolean

  /** Per-comment controls, for an author amending their own entry. */
  renderActions?: (comment: MentorCommentView) => ReactNode
}

interface CommentThread {
  key: string
  taskId?: string
  taskName?: string
  projectName?: string
  developerName: string

  /** Oldest first, so the card reads in the order it was written. */
  comments: MentorCommentView[]
}

export function CommentTimeline({
  comments,
  emptyMessage,
  renderActions,
  showDeveloper = true,
}: CommentTimelineProps) {
  if (comments.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <ol className="comment-timeline">
      {toThreads(comments).map((thread) => (
        <li className="comment-timeline__item" key={thread.key}>
          <div className="comment-timeline__header">
            <div>
              <h3
                className={`comment-timeline__task${
                  thread.taskName === undefined ? ' comment-timeline__task--general' : ''
                }`}
              >
                {thread.taskId === undefined || thread.taskName === undefined ? (
                  (thread.taskName ?? thread.projectName ?? 'General feedback')
                ) : (
                  <Link className="comment-timeline__link" to={`/tasks/${thread.taskId}`}>
                    {thread.taskName}
                  </Link>
                )}
              </h3>

              <p className="comment-timeline__meta">{describeThread(thread)}</p>

              {showDeveloper ? (
                <p className="comment-timeline__developer">{thread.developerName}</p>
              ) : null}
            </div>
          </div>

          <TaskCommentTrail
            authorRole="developer"
            canComment={false}
            comments={thread.comments}
            isSubmitting={false}
            onAddComment={() => Promise.resolve(false)}
            renderActions={renderActions}
          />

          {thread.taskId === undefined ? null : (
            <Link className="comment-timeline__open" to={`/tasks/${thread.taskId}`}>
              Open the task to reply
            </Link>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * One thread per task, in order of most recent activity.
 *
 * Insertion order carries that already, the caller having sorted newest first,
 * so the map is walked rather than sorted again. Feedback naming no task is its
 * own thread: it belongs to no conversation and cannot be replied to.
 */
function toThreads(comments: readonly MentorCommentView[]): CommentThread[] {
  const threads = new Map<string, CommentThread>()

  for (const comment of comments) {
    const key = comment.taskId === undefined ? `general:${comment.id}` : `task:${comment.taskId}`
    const thread = threads.get(key)

    if (thread === undefined) {
      threads.set(key, {
        key,
        ...(comment.taskId === undefined ? {} : { taskId: comment.taskId }),
        ...(comment.taskName === undefined ? {} : { taskName: comment.taskName }),
        ...(comment.projectName === undefined ? {} : { projectName: comment.projectName }),
        developerName: comment.developerName,
        comments: [comment],
      })

      continue
    }

    thread.comments.push(comment)
  }

  for (const thread of threads.values()) {
    thread.comments.sort((first, second) => first.createdAt.localeCompare(second.createdAt))
  }

  return [...threads.values()]
}

function describeThread(thread: CommentThread): string {
  const count = thread.comments.length
  const latest = thread.comments[count - 1]

  return [
    count === 1 ? '1 comment' : `${String(count)} comments`,
    latest === undefined ? undefined : `last on ${formatLongDate(latest.date)}`,
    thread.taskName === undefined ? undefined : thread.projectName,
  ]
    .filter((part) => part !== undefined)
    .join(' · ')
}
