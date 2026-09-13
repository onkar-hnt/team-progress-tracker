import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { TaskTable } from '@features/tasks/components/TaskTable'
import { useTasks } from '@hooks/use-work-tracker'
import type { AssignedTaskView } from '@services/work-tracker.service'
import { comparePriority } from '@utils/task.utils'

const VISIBLE_LIMIT = 5

export function AssignedWorkPanel() {
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

function sortOpenTasks(tasks: readonly AssignedTaskView[]): AssignedTaskView[] {
  return tasks
    .filter((task) => task.status !== 'completed')
    .sort((left, right) => {
      if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1

      if (left.dueDate !== right.dueDate) {
        if (left.dueDate === undefined) return 1
        if (right.dueDate === undefined) return -1
        return left.dueDate.localeCompare(right.dueDate)
      }

      return comparePriority(left.priority, right.priority)
    })
}
