import { useMemo, useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { TASK_STATUS_OPTIONS } from '@constants/task.constants'
import { useTasks, useUpdateTask } from '@hooks/use-work-tracker'
import { useAccessScope } from '@hooks/use-access-scope'
import type { TaskStatus } from '@models/index'
import { canUpdateTaskStatus, canViewTeamData } from '@services/auth/index'
import type { AssignedTaskView } from '@services/work-tracker.service'

import { TaskTable } from '../components/TaskTable'

import './MyTasksPage.scss'

/**
 * Assigned work for the signed-in person.
 *
 * A developer sees only their own tasks; a mentor opening the same screen sees
 * their own plus the developers assigned to them, because the scope decides
 * what the query returns rather than this page. The only thing that changes
 * here is whether the developer column is worth showing.
 */
export function MyTasksPage() {
  const { user } = useAuth()
  const { scope } = useAccessScope()
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')

  const query = useMemo(
    () => (statusFilter === 'all' ? undefined : { statuses: [statusFilter] }),
    [statusFilter],
  )

  const tasksQuery = useTasks(query)
  const updateTask = useUpdateTask()

  const tasks = tasksQuery.data ?? []
  const counts = useMemo(() => summariseTasks(tasksQuery.data ?? []), [tasksQuery.data])

  const statusPicker = (
    <label className="my-tasks__filter">
      <span>Status</span>
      <select
        onChange={(event) => setStatusFilter(event.target.value as TaskStatus | 'all')}
        value={statusFilter}
      >
        <option value="all">All statuses</option>
        {TASK_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="my-tasks">
      <Panel
        action={statusPicker}
        description="Work assigned to you, with the status you can keep up to date."
        isPageHeading
        title="My tasks"
      >
        {tasksQuery.isPending ? (
          <Skeleton label="Loading your tasks…" rows={4} />
        ) : (
          <div className="stat-card-grid">
            <StatCard label="Assigned" value={counts.total} />
            <StatCard label="In progress" value={counts.inProgress} tone="progress" />
            <StatCard label="Completed" tone="positive" value={counts.completed} />
            <StatCard
              label="Overdue"
              tone={counts.overdue > 0 ? 'attention' : 'neutral'}
              value={counts.overdue}
            />
          </div>
        )}
      </Panel>

      <Panel
        description={
          canViewTeamData(user)
            ? 'Your tasks and those of the developers you mentor.'
            : 'Change a status as your work progresses.'
        }
        title="Task list"
      >
        {tasksQuery.error !== null ? (
          <ErrorState
            message={`Tasks could not be loaded: ${tasksQuery.error.message}`}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : tasksQuery.isPending ? (
          <Skeleton rows={5} />
        ) : (
          <TaskTable
            emptyMessage="No tasks match this filter."
            renderActions={(task) => (
              <StatusSelect
                isDisabled={!canUpdateTaskStatus(user, scope, task) || updateTask.isPending}
                onChange={(status) => {
                  updateTask.mutate({ id: task.id, changes: { status } })
                }}
                task={task}
              />
            )}
            showDeveloper={canViewTeamData(user)}
            tasks={tasks}
          />
        )}

        {updateTask.error === null ? null : (
          <p className="form__alert">{`The status could not be saved: ${updateTask.error.message}`}</p>
        )}
      </Panel>
    </div>
  )
}

/**
 * Status is changed in place rather than through a dialog.
 *
 * Updating a status is the most frequent action on this screen and carries no
 * risk of data loss, so a select that saves on change costs one interaction
 * instead of four.
 */
function StatusSelect({
  isDisabled,
  onChange,
  task,
}: {
  isDisabled: boolean
  onChange: (status: TaskStatus) => void
  task: AssignedTaskView
}) {
  return (
    <label className="my-tasks__status">
      <span className="sr-only">{`Status for ${task.name}`}</span>
      <select
        disabled={isDisabled}
        onChange={(event) => {
          onChange(event.target.value as TaskStatus)
        }}
        value={task.status}
      >
        {TASK_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function summariseTasks(tasks: readonly AssignedTaskView[]) {
  return {
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === 'in-progress').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    overdue: tasks.filter((task) => task.isOverdue).length,
  }
}
