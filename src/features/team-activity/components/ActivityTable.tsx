import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { EmptyState } from '@components/ui/feedback/Feedback'
import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
import { useTableSort } from '@hooks/use-table-sort'
import type { AppUser } from '@models/user.model'
import { canDeleteEntry, canEditEntry } from '@services/auth/index'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { formatShortDate } from '@utils/date.utils'
import { sortRows } from '@utils/table.utils'
import { comparePriority, compareStatus } from '@utils/task.utils'

import './ActivityTable.scss'

type SortKey = 'date' | 'developer' | 'hours' | 'priority' | 'progress' | 'project' | 'status'

const COLUMNS: readonly { key: SortKey; label: string; isNumeric?: boolean }[] = [
  { key: 'date', label: 'Date' },
  { key: 'developer', label: 'Developer' },
  { key: 'project', label: 'Project' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'progress', label: 'Progress', isNumeric: true },
  { key: 'hours', label: 'Hours', isNumeric: true },
]

function compareEntries(left: DailyWorkEntryView, right: DailyWorkEntryView, key: SortKey): number {
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
 * How many rows are drawn before the rest are offered.
 *
 * The whole point of the filters above this table is that the answer is usually
 * far smaller than this, so most periods never see the button. A month of a busy
 * team does, and it is the case that matters: five hundred rows of tooltips and
 * badges is a second of layout on every sort, for a table nobody reads past the
 * first screen of.
 *
 * The rows are all fetched and all sorted — this caps rendering, not data. So the
 * figures above the table, and the order the first page appears in, are those of
 * the whole period rather than of what happens to be drawn.
 */
const ROWS_PER_PAGE = 100

/**
 * Sortable table of work entries.
 *
 * A semantic table with button headings rather than a data-grid dependency: for one
 * team the row count never justifies the bundle, and this keeps sorting, focus
 * order and screen-reader output predictable. The headings are `SortableHeader`,
 * which started here and now serves five other tables — this one kept its own copy
 * for a while after that, with its own `aria-sort` ternary to get wrong.
 */
export function ActivityTable({ deletingId, entries, onDelete, onEdit, user }: ActivityTableProps) {
  // Dates, counts and hours read newest-and-largest first; names and statuses read
  // alphabetically. The hook holds that rule for every table that sorts.
  const { sort, toggle } = useTableSort<SortKey>({ key: 'date', direction: 'desc' }, [
    'date',
    'hours',
    'progress',
  ])

  const [extraPages, setExtraPages] = useState(0)

  const sorted = useMemo(
    () =>
      // Ties fall back to the work date so the order never jitters between renders
      // for rows that are otherwise equal.
      sortRows(entries, sort, compareEntries, (left, right) =>
        right.date.localeCompare(left.date),
      ),
    [entries, sort],
  )

  if (entries.length === 0) {
    return (
      <EmptyState
        message="Widen the date range, or clear a filter, to see more of the team's work."
        title="No entries match these filters"
        variant="filtered"
      />
    )
  }

  const shown = Math.min(ROWS_PER_PAGE * (extraPages + 1), sorted.length)
  const remaining = sorted.length - shown

  return (
    <div className="data-table__scroll">
      <table className="data-table activity-table">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <SortableHeader
                columnKey={column.key}
                isNumeric={column.isNumeric ?? false}
                key={column.key}
                label={column.label}
                onSort={toggle}
                sort={sort}
              />
            ))}
            <th scope="col">Task</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {sorted.slice(0, shown).map((entry) => {
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
                {/* A line each, cut off rather than wrapped. Somebody who
                    pasted four sentences into one update used to make their row
                    six times the height of every other, and a table whose rows
                    are all different heights cannot be scanned down a column.
                    The whole text is a hover away. */}
                <td className="activity-table__task">
                  <p className="activity-table__title">
                    <Tooltip clips label={entry.taskTitle}>
                      {entry.taskTitle}
                    </Tooltip>
                  </p>
                  {entry.description === undefined ? null : (
                    <p className="activity-table__description">
                      <Tooltip clips label={entry.description}>
                        {entry.description}
                      </Tooltip>
                    </p>
                  )}
                  {entry.blockerDescription === undefined ? null : (
                    <p className="activity-table__blocker">
                      <Tooltip clips label={`Blocker: ${entry.blockerDescription}`}>
                        Blocker: {entry.blockerDescription}
                      </Tooltip>
                    </p>
                  )}
                  {entry.remarks === undefined ? null : (
                    <p className="activity-table__description">
                      <Tooltip clips label={entry.remarks}>
                        {entry.remarks}
                      </Tooltip>
                    </p>
                  )}
                </td>
                <td className="activity-table__actions">
                  <div className="row-actions">
                    {canEditEntry(user, entry) ? (
                      <Button onClick={() => onEdit(entry)} size="small" variant="secondary">
                        Edit
                      </Button>
                    ) : null}

                    {/* One Delete, which opens the confirmation dialog every other
                        delete in the application opens. This row used to hold its
                        own two-click confirm — press Delete, press Confirm — from
                        before there was a dialog, and once the screen grew one the
                        two stacked up: three presses to remove one entry, the
                        second of them a button that looked like the deed itself. */}
                    {canDeleteEntry(user, entry) ? (
                      <Button
                        isLoading={isDeleting}
                        onClick={() => onDelete(entry)}
                        size="small"
                        variant="danger"
                      >
                        {isDeleting ? 'Deleting…' : 'Delete'}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {remaining === 0 ? null : (
        // Inside the horizontally scrolling wrapper, so it stays with the table it
        // belongs to. `sticky` on the left edge keeps it visible on a narrow
        // window, where the table itself is wider than the panel.
        <div className="activity-table__more">
          <p>
            Showing {shown} of {sorted.length} entries.
          </p>

          <Button
            onClick={() => {
              setExtraPages((current) => current + 1)
            }}
            size="small"
            variant="secondary"
          >
            Show {Math.min(remaining, ROWS_PER_PAGE)} more
          </Button>
        </div>
      )}
    </div>
  )
}
