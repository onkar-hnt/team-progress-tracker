import { useMemo } from 'react'
import type { ReactNode } from 'react'

import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { EmptyState } from '@components/ui/feedback/Feedback'
import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
import { useTableSort } from '@hooks/use-table-sort'
import type { AssignedTaskView } from '@services/work-tracker.service'
import { formatShortDate } from '@utils/date.utils'
import { comparePriority, compareStatus } from '@utils/task.utils'
import { compareText, sortRows } from '@utils/table.utils'

import './TaskTable.scss'

type SortKey = 'developer' | 'due' | 'priority' | 'project' | 'status' | 'task'

function compareTasks(left: AssignedTaskView, right: AssignedTaskView, key: SortKey): number {
  switch (key) {
    case 'task':
      return compareText(left.name, right.name)
    case 'developer':
      return compareText(left.developerName, right.developerName)
    case 'project':
      return compareText(left.projectName, right.projectName)
    case 'priority':
      return comparePriority(left.priority, right.priority)
    case 'status':
      return compareStatus(left.status, right.status)
    case 'due':
      // ISO dates, so comparing the text is comparing the dates. Undated tasks
      // sort last ascending, which is what `compareText` does with an absent
      // value — and is right here, since a task with no deadline is not the one
      // to look at first.
      return compareText(left.dueDate, right.dueDate)
  }
}

interface TaskTableProps {
  tasks: readonly AssignedTaskView[]
  emptyMessage: string

  /** Hidden on a single developer's page, where every row is the same person. */
  showDeveloper?: boolean

  /** Rendered in the last column, for the actions a given screen allows. */
  renderActions?: (task: AssignedTaskView) => ReactNode
}

/**
 * Assigned work in a table.
 *
 * Shared by the developer's own task list, the mentor's view of their team and
 * the admin's management screen. The rows are identical in all three; only the
 * actions column differs, which is why it is a render prop rather than a set
 * of role flags inside this component.
 *
 * Sorting lives here rather than in each of those screens, for the same reason:
 * the columns are this component's, so the comparator belongs beside them, and
 * putting it here gave all three screens the same behaviour in one change.
 *
 * It opens on the due date, soonest first. Tasks arrive from the provider in no
 * particular order — `getTaskViews` resolves names and computes `isOverdue` but
 * deliberately does not sort — so before this the first row was whichever one the
 * database happened to return first, which is the one order that means nothing.
 */
export function TaskTable({
  emptyMessage,
  renderActions,
  showDeveloper = true,
  tasks,
}: TaskTableProps) {
  const { sort, toggle } = useTableSort<SortKey>({ key: 'due', direction: 'asc' })

  const sorted = useMemo(
    // Tie-broken by name so that a column of equal priorities, or a screen full
    // of undated tasks, stays in one order between renders.
    () => sortRows(tasks, sort, compareTasks, (left, right) => compareText(left.name, right.name)),
    [sort, tasks],
  )

  if (tasks.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <div className="data-table__scroll">
      <table className="data-table task-table">
        <thead>
          <tr>
            <SortableHeader columnKey="task" label="Task" onSort={toggle} sort={sort} />
            {showDeveloper ? (
              <SortableHeader columnKey="developer" label="Developer" onSort={toggle} sort={sort} />
            ) : null}
            <SortableHeader columnKey="project" label="Project" onSort={toggle} sort={sort} />
            <SortableHeader columnKey="priority" label="Priority" onSort={toggle} sort={sort} />
            <SortableHeader columnKey="status" label="Status" onSort={toggle} sort={sort} />
            <SortableHeader columnKey="due" label="Due" onSort={toggle} sort={sort} />
            {renderActions === undefined ? null : <th scope="col">Actions</th>}
          </tr>
        </thead>

        <tbody>
          {sorted.map((task) => (
            <tr key={task.id}>
              {/* A line each, cut off rather than wrapped, so every row is the
                  same height however much somebody typed. The whole text is a
                  hover away. */}
              <td>
                <span className="task-table__name">
                  <Tooltip clips label={task.name}>
                    {task.name}
                  </Tooltip>
                </span>
                {task.description === undefined ? null : (
                  <span className="task-table__description">
                    <Tooltip clips label={task.description}>
                      {task.description}
                    </Tooltip>
                  </span>
                )}
              </td>
              {showDeveloper ? <td>{task.developerName}</td> : null}
              <td>{task.projectName}</td>
              <td>
                <PriorityBadge priority={task.priority} />
              </td>
              <td>
                <StatusBadge status={task.status} />
              </td>
              <td>
                {task.dueDate === undefined ? (
                  '—'
                ) : (
                  <span className={task.isOverdue ? 'task-table__due--overdue' : undefined}>
                    {formatShortDate(task.dueDate)}
                    {/* Marked in text as well as colour, so the warning does
                        not depend on being able to see the difference. */}
                    {task.isOverdue ? ' · overdue' : ''}
                  </span>
                )}
              </td>
              {renderActions === undefined ? null : <td>{renderActions(task)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
