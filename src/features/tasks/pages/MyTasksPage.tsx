import { useMemo, useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
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

  const filter = useMemo(
    () => (statusFilter === 'all' ? undefined : { statuses: [statusFilter] }),
    [statusFilter],
  )

  // Two reads of the same table, deliberately.
  //
  // The list is narrowed at source, so choosing a status still goes through
  // the repository predicate and the index built for it. The cards describe
  // the whole workload and must not move when the filter does — counting the
  // filtered rows made "Assigned" mean "assigned and completed" as soon as
  // somebody picked Completed.
  //
  // With no filter chosen both hooks build the same key, so React Query
  // serves them from one request and the default view costs nothing extra.
  const tasksQuery = useTasks(filter)
  const allTasksQuery = useTasks()
  const updateTask = useUpdateTask()

  const counts = useMemo(() => summariseTasks(allTasksQuery.data ?? []), [allTasksQuery.data])

  const loadError = tasksQuery.error ?? allTasksQuery.error

  // Only one status is ever in flight, and it is the row being saved that
  // should say so — disabling every select on the page made a single change
  // look like the whole screen had locked up.
  const savingTaskId = updateTask.isPending ? (updateTask.variables?.id ?? null) : null

  // An empty scope is not an empty task list. It means the signed-in profile
  // is not linked to an employee row, so there is nothing it could ever be
  // assigned, and the query short-circuits before it reaches Supabase.
  // Rendering the ordinary zero-state here would report a setup problem as an
  // absence of work.
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
        {allTasksQuery.isPending ? (
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
        {loadError !== null ? (
          <ErrorState
            message={`Tasks could not be loaded: ${loadError.message}`}
            onRetry={() => {
              void tasksQuery.refetch()
              void allTasksQuery.refetch()
            }}
          />
        ) : tasksQuery.isPending ? (
          <Skeleton rows={5} />
        ) : (
          <TaskTable
            // A filtered view that finds nothing and a genuinely empty list
            // are different answers, and only one of them is worth clearing
            // the filter over.
            emptyMessage={
              statusFilter === 'all'
                ? 'No tasks have been assigned to you yet.'
                : 'No tasks match this filter.'
            }
            renderActions={(task) => (
              <StatusSelect
                isDisabled={!canUpdateTaskStatus(user, scope, task) || savingTaskId === task.id}
                isSaving={savingTaskId === task.id}
                onChange={(status) => {
                  updateTask.mutate({ id: task.id, changes: { status } })
                }}
                task={task}
              />
            )}
            showDeveloper={canViewTeamData(user)}
            tasks={tasksQuery.data ?? []}
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
    <label className="my-tasks__status">
      <span className="sr-only">{`Status for ${task.name}`}</span>
      <select
        disabled={isDisabled}
        onChange={(event) => {
          const next = event.target.value as TaskStatus

          // Re-picking the value already showing is still a write, and one
          // that would refetch every derived view to prove nothing changed.
          if (next !== task.status) onChange(next)
        }}
        value={task.status}
      >
        {TASK_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {isSaving ? (
        <span className="my-tasks__saving" role="status">
          Saving…
        </span>
      ) : null}
    </label>
  )
}

/**
 * Counts for the summary cards.
 *
 * `isOverdue` is taken from the view rather than recomputed, so the cards and
 * the "· overdue" marker in the table can never disagree about what counts as
 * late. The rule lives in `WorkTrackerService.getTaskViews`: past its due date
 * and not yet completed.
 */
function summariseTasks(tasks: readonly AssignedTaskView[]) {
  return {
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === 'in-progress').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    overdue: tasks.filter((task) => task.isOverdue).length,
  }
}
