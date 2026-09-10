import type { ReactNode } from 'react'

import { EmptyState } from '@components/ui/feedback/Feedback'
import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import type { AssignedTaskView } from '@services/work-tracker.service'
import { formatShortDate } from '@utils/date.utils'

import './TaskTable.scss'

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
 */
export function TaskTable({
  emptyMessage,
  renderActions,
  showDeveloper = true,
  tasks,
}: TaskTableProps) {
  if (tasks.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <div className="table-scroll">
      <table className="data-table task-table">
        <thead>
          <tr>
            <th scope="col">Task</th>
            {showDeveloper ? <th scope="col">Developer</th> : null}
            <th scope="col">Project</th>
            <th scope="col">Priority</th>
            <th scope="col">Status</th>
            <th scope="col">Due</th>
            {renderActions === undefined ? null : <th scope="col">Actions</th>}
          </tr>
        </thead>

        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <span className="task-table__name">{task.name}</span>
                {task.description === undefined ? null : (
                  <span className="task-table__description">{task.description}</span>
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
