import { useMemo, useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { TASK_STATUS_LABELS, TASK_STATUS_OPTIONS } from '@constants/task.constants'
import { useComments, useTasks, useUpdateTask } from '@hooks/use-work-tracker'
import { useAccessScope } from '@hooks/use-access-scope'
import type { TaskStatus } from '@models/index'
import { canUpdateTaskStatus, canViewTeamData } from '@services/auth/index'
import type { AssignedTaskView } from '@services/work-tracker.service'
import { countCommentsByTask } from '@utils/task.utils'

import { TaskTable } from '../components/TaskTable'

import './MyTasksPage.scss'

const STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'All statuses' }, ...TASK_STATUS_OPTIONS]

export function MyTasksPage() {
  const { user } = useAuth()
  const snackbar = useSnackbar()
  const { scope } = useAccessScope()
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')

  const tasksQuery = useTasks()
  const commentsQuery = useComments()
  const updateTask = useUpdateTask()

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])

  const commentCounts = useMemo(
    () => countCommentsByTask(commentsQuery.data ?? []),
    [commentsQuery.data],
  )

  const visibleTasks = useMemo(
    () => (statusFilter === 'all' ? tasks : tasks.filter((task) => task.status === statusFilter)),
    [statusFilter, tasks],
  )

  const counts = useMemo(() => summariseTasks(tasks), [tasks])

  const loadError = tasksQuery.error

  const savingTaskId = updateTask.isPending ? (updateTask.variables?.id ?? null) : null

  if (scope !== null && scope.visibleDeveloperIds?.length === 0) {
    return (
      <PagePlaceholder
        description="This account is not linked to an employee record, so no assigned work can be shown. Ask your mentor or administrator to check the account setup."
        title="No assigned work"
      />
    )
  }

  const statusPicker = (
    <label className="my-tasks__filter">
      <span>Status</span>
      <Dropdown
        ariaLabel="Status"
        onChange={(next) => setStatusFilter(next as TaskStatus | 'all')}
        options={STATUS_FILTER_OPTIONS}
        value={statusFilter}
      />
    </label>
  )

  return (
    <div className="my-tasks">
      <Panel
        action={statusPicker}
        description="Work assigned to you and work you logged yourself, with the status you can keep up to date."
        isPageHeading
        title="My tasks"
      >
        {tasksQuery.isPending ? (
          <Skeleton label="Loading your tasks…" rows={4} />
        ) : (
          <div className="stat-card-grid">
            <StatCard icon="tasks" label="Assigned" value={counts.total} />
            <StatCard
              icon="activity"
              label="In progress"
              tone="progress"
              value={counts.inProgress}
            />
            <StatCard icon="check" label="Completed" tone="positive" value={counts.completed} />
            <StatCard
              icon="alert"
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
        fills={visibleTasks.length > 0}
        title="Task list"
      >
        {loadError !== null ? (
          <ErrorState
            message={`Tasks could not be loaded: ${loadError.message}`}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : tasksQuery.isPending ? (
          <Skeleton rows={5} />
        ) : (
          <TaskTable
            commentCounts={commentCounts}
            emptyMessage={
              statusFilter !== 'all'
                ? 'No tasks match this filter.'
                : canViewTeamData(user)
                  ? 'No tasks have been assigned yet. Assign work from Administration → Tasks.'
                  : 'Nothing here yet. A task appears when one is assigned to you, or when you log a daily update.'
            }
            renderActions={(task) => (
              <StatusSelect
                isDisabled={!canUpdateTaskStatus(user, scope, task) || savingTaskId === task.id}
                isSaving={savingTaskId === task.id}
                onChange={(status) => {
                  updateTask.mutate(
                    { id: task.id, changes: { status } },
                    {
                      onSuccess: () => {
                        snackbar.success(
                          `“${task.name}” is now ${TASK_STATUS_LABELS[status]}.`,
                        )
                      },
                    },
                  )
                }}
                task={task}
              />
            )}
            showDeveloper={canViewTeamData(user)}
            tasks={visibleTasks}
          />
        )}
      </Panel>
    </div>
  )
}

function StatusSelect({
  isDisabled,
  isSaving,
  onChange,
  task,
}: {
  isDisabled: boolean
  isSaving: boolean
  onChange: (status: TaskStatus) => void
  task: AssignedTaskView
}) {
  return (
    <div className="my-tasks__status">
      <Dropdown
        ariaLabel={`Status for ${task.name}`}
        disabled={isDisabled}
        isCompact
        onChange={(next) => {
          if (next !== task.status) onChange(next as TaskStatus)
        }}
        options={TASK_STATUS_OPTIONS}
        value={task.status}
      />

      {isSaving ? (
        <span className="my-tasks__saving" role="status">
          Saving…
        </span>
      ) : null}
    </div>
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
