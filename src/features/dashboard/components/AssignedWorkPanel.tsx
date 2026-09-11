import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { TaskTable } from '@features/tasks/components/TaskTable'
import { useTasks } from '@hooks/use-work-tracker'
import type { AssignedTaskView } from '@services/work-tracker.service'
import { comparePriority } from '@utils/task.utils'

/** Enough to see what is pressing without turning the dashboard into a task list. */
const VISIBLE_LIMIT = 5

/**
 * Unfinished work assigned to the signed-in developer.
 *
 * Every other figure on the dashboard is derived from daily updates, so
 * without this a developer who changed a task's status on My Tasks would see
 * nothing here move. Read-only on purpose: My Tasks is where a status is
 * changed, and the permission to change it is already decided there.
 *
 * Rendered only for people who see just themselves. A mentor or admin gets
 * the team panels instead, and their dashboard is unchanged.
 */
export function AssignedWorkPanel() {
  // Unscoped by query, narrowed by the access scope inside the hook — which
  // is also the key the My Tasks summary cards read, so the two share one
  // request and cannot disagree.
  const tasksQuery = useTasks()

  const openTasks = useMemo(() => sortOpenTasks(tasksQuery.data ?? []), [tasksQuery.data])

  return (
    <Panel
      action={<Link to="/my-tasks">All my tasks</Link>}
      description="Unfinished work assigned to you, most urgent first."
      title="Assigned work"
    >
      {tasksQuery.isPending ? (
        <Skeleton label="Loading your assigned work…" rows={3} />
      ) : tasksQuery.error !== null ? (
        <ErrorState
          message={`Assigned work could not be loaded: ${tasksQuery.error.message}`}
          onRetry={() => void tasksQuery.refetch()}
        />
      ) : (
        <TaskTable
          emptyMessage="Nothing outstanding — no open tasks are assigned to you."
          showDeveloper={false}
          tasks={openTasks.slice(0, VISIBLE_LIMIT)}
        />
      )}
    </Panel>
  )
}

/**
 * Open tasks, ordered by how soon they need attention.
 *
 * Completed work is dropped rather than sorted last: this panel answers "what
 * is on me now", and a finished task is only history. `isOverdue` comes from
 * the view, so this agrees with the overdue count on My Tasks.
 */
function sortOpenTasks(tasks: readonly AssignedTaskView[]): AssignedTaskView[] {
  return tasks
    .filter((task) => task.status !== 'completed')
    .sort((left, right) => {
      if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1

      // A task with no due date sorts last rather than as though it were due
      // today, which is what comparing an absent date as an empty string
      // would do.
      if (left.dueDate !== right.dueDate) {
        if (left.dueDate === undefined) return 1
        if (right.dueDate === undefined) return -1
        return left.dueDate.localeCompare(right.dueDate)
      }

      return comparePriority(left.priority, right.priority)
    })
}
