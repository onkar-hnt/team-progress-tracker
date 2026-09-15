import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { EmptyState } from '@components/ui/feedback/Feedback'
import { Icon } from '@components/ui/icons/Icon'
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
      return compareText(left.dueDate, right.dueDate)
  }
}

interface TaskTableProps {
  tasks: readonly AssignedTaskView[]
  emptyMessage: string
  showDeveloper?: boolean

  /** Comment totals by task id. The column appears only when these are given. */
  commentCounts?: ReadonlyMap<string, number>

  renderActions?: (task: AssignedTaskView) => ReactNode
}

export function TaskTable({
  commentCounts,
  emptyMessage,
  renderActions,
  showDeveloper = true,
  tasks,
}: TaskTableProps) {
  const { sort, toggle } = useTableSort<SortKey>({ key: 'due', direction: 'asc' })

  const sorted = useMemo(
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
            {commentCounts === undefined ? null : <th scope="col">Comments</th>}
            {renderActions === undefined ? null : <th scope="col">Actions</th>}
          </tr>
        </thead>

        <tbody>
          {sorted.map((task) => (
            <tr key={task.id}>
              <td>
                {/* The task name is the way into the conversation on it. */}
                <Link className="task-table__name" to={`/tasks/${task.id}`}>
                  <Tooltip clips label={task.name}>
                    {task.name}
                  </Tooltip>
                </Link>
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
                    {task.isOverdue ? ' · overdue' : ''}
                  </span>
                )}
              </td>
              {commentCounts === undefined ? null : (
                <td>
                  <CommentCount count={commentCounts.get(task.id) ?? 0} />
                </td>
              )}
              {renderActions === undefined ? null : <td>{renderActions(task)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CommentCount({ count }: { count: number }) {
  if (count === 0) return <span className="task-table__comments">—</span>

  return (
    <span
      aria-label={`${String(count)} ${count === 1 ? 'comment' : 'comments'}`}
      className="task-table__comments task-table__comments--some"
    >
      <Icon name="comments" size={16} />
      {count}
    </span>
  )
}
