import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@components/ui/feedback/Feedback'
import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import type { AppUser } from '@models/user.model'
import { canDeleteEntry, canEditEntry } from '@services/auth/index'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { formatShortDate } from '@utils/date.utils'
import { comparePriority, compareStatus } from '@utils/task.utils'

import './ActivityTable.scss'

type SortKey = 'date' | 'developer' | 'hours' | 'priority' | 'progress' | 'project' | 'status'

interface SortState {
  key: SortKey
  direction: 'asc' | 'desc'
}

const COLUMNS: readonly { key: SortKey; label: string; isNumeric?: boolean }[] = [
  { key: 'date', label: 'Date' },
  { key: 'developer', label: 'Developer' },
  { key: 'project', label: 'Project' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'progress', label: 'Progress', isNumeric: true },
  { key: 'hours', label: 'Hours', isNumeric: true },
]

function compareEntries(
  left: DailyWorkEntryView,
  right: DailyWorkEntryView,
  key: SortKey,
): number {
  switch (key) {
    case 'date':
      return left.date.localeCompare(right.date)
    case 'developer':
      return left.developerName.localeCompare(right.developerName)
    case 'project':
      return left.projectName.localeCompare(right.projectName)
    case 'status':
      return compareStatus(left.status, right.status)
    case 'priority':
      return comparePriority(left.priority, right.priority)
    case 'progress':
      return left.progress - right.progress
    case 'hours':
      return (left.hoursSpent ?? 0) - (right.hoursSpent ?? 0)
  }
}

interface ActivityTableProps {
  entries: readonly DailyWorkEntryView[]
  user: AppUser | null
  onEdit: (entry: DailyWorkEntryView) => void
  onDelete: (entry: DailyWorkEntryView) => void
  deletingId: string | null
}

/**
 * Sortable table of work entries.
 *
 * A semantic table with button-based headers is used instead of a data-grid
 * dependency: for one team the row count never justifies the bundle cost, and
 * this keeps sorting, focus order and screen-reader output predictable.
 */
export function ActivityTable({
  deletingId,
  entries,
  onDelete,
  onEdit,
  user,
}: ActivityTableProps) {
  const [sort, setSort] = useState<SortState>({ key: 'date', direction: 'desc' })
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1

    return [...entries].sort((left, right) => {
      const primary = compareEntries(left, right, sort.key) * factor
      // Ties fall back to the work date so the order never jitters between
      // renders for rows that are otherwise equal.
      return primary !== 0 ? primary : right.date.localeCompare(left.date)
    })
  }, [entries, sort])

  if (entries.length === 0) {
    return <EmptyState message="No entries match the current filters." />
  }

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'date' ? 'desc' : 'asc' },
    )
  }

  return (
    <div className="data-table__scroll">
      <table className="data-table activity-table">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th
                aria-sort={
                  sort.key === column.key
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                className={column.isNumeric === true ? 'data-table__numeric' : undefined}
                key={column.key}
                scope="col"
              >
                <button
                  className="data-table__sort"
                  onClick={() => toggleSort(column.key)}
                  type="button"
                >
                  {column.label}
                  {sort.key === column.key ? (
                    <span aria-hidden="true" className="data-table__sort-indicator">
                      {sort.direction === 'asc' ? '▲' : '▼'}
                    </span>
                  ) : null}
                </button>
              </th>
            ))}
            <th scope="col">Task</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((entry) => {
            const isConfirming = confirmingId === entry.id
            const isDeleting = deletingId === entry.id

            return (
              <tr key={entry.id}>
                <td className="data-table__nowrap">{formatShortDate(entry.date)}</td>
                <td className="data-table__nowrap">
                  <Link to={`/developers/${entry.developerId}`}>{entry.developerName}</Link>
                </td>
                <td className="data-table__nowrap">{entry.projectName}</td>
                <td>
                  <StatusBadge status={entry.status} />
                </td>
                <td>
                  <PriorityBadge priority={entry.priority} />
                </td>
                <td className="data-table__numeric">{entry.progress}%</td>
                <td className="data-table__numeric">
                  {entry.hoursSpent === undefined ? '—' : entry.hoursSpent}
                </td>
                <td className="activity-table__task">
                  <p className="activity-table__title">{entry.taskTitle}</p>
                  {entry.description === undefined ? null : (
                    <p className="activity-table__description">{entry.description}</p>
                  )}
                  {entry.blockerDescription === undefined ? null : (
                    <p className="activity-table__blocker">Blocker: {entry.blockerDescription}</p>
                  )}
                  {entry.remarks === undefined ? null : (
                    <p className="activity-table__description">{entry.remarks}</p>
                  )}
                </td>
                <td className="activity-table__actions">
                  {canEditEntry(user, entry) ? (
                    <button
                      className="activity-table__action"
                      onClick={() => onEdit(entry)}
                      type="button"
                    >
                      Edit
                    </button>
                  ) : null}

                  {canDeleteEntry(user, entry) ? (
                    // Deleting takes two clicks rather than a modal: the
                    // confirmation is right where the pointer already is, and
                    // there is no undo behind it.
                    isConfirming ? (
                      <span className="activity-table__confirm">
                        <button
                          className="activity-table__action activity-table__action--danger"
                          disabled={isDeleting}
                          onClick={() => {
                            setConfirmingId(null)
                            onDelete(entry)
                          }}
                          type="button"
                        >
                          {isDeleting ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button
                          className="activity-table__action"
                          onClick={() => setConfirmingId(null)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        className="activity-table__action activity-table__action--danger"
                        onClick={() => setConfirmingId(entry.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    )
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
