import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { EmptyState } from '@components/ui/feedback/Feedback'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
import { useTableSort } from '@hooks/use-table-sort'
import type { DeveloperUpdateCoverage } from '@utils/update-coverage.utils'
import { formatLongDate, formatShortDate } from '@utils/date.utils'
import { sortRows } from '@utils/table.utils'

import './MissingUpdatesTable.scss'

type SortKey = 'developer' | 'last' | 'leave' | 'missing' | 'submitted'

const COLUMNS: readonly { key: SortKey; label: string; isNumeric?: boolean }[] = [
  { key: 'developer', label: 'Developer' },
  { key: 'missing', label: 'Missing', isNumeric: true },
  { key: 'leave', label: 'On leave', isNumeric: true },
  { key: 'submitted', label: 'Submitted', isNumeric: true },
  { key: 'last', label: 'Last update' },
]

/** Enough dates to read at a glance; the rest are counted. */
const DATES_SHOWN = 6

function compareRows(
  left: DeveloperUpdateCoverage,
  right: DeveloperUpdateCoverage,
  key: SortKey,
): number {
  switch (key) {
    case 'developer':
      return left.developer.name.localeCompare(right.developer.name)
    case 'missing':
      return left.missingCount - right.missingCount
    case 'leave':
      return left.leaveCount - right.leaveCount
    case 'submitted':
      return left.submittedCount - right.submittedCount
    case 'last':
      // Never submitted sorts as the longest wait, not as the shortest.
      return (left.lastSubmittedDate ?? '').localeCompare(right.lastSubmittedDate ?? '')
  }
}

interface MissingUpdatesTableProps {
  rows: readonly DeveloperUpdateCoverage[]

  /** Absent for a reader who may not remind anybody. */
  onRemind?: (row: DeveloperUpdateCoverage) => void

  remindingId?: string | null
}

export function MissingUpdatesTable({
  onRemind,
  remindingId = null,
  rows,
}: MissingUpdatesTableProps) {
  const { sort, toggle } = useTableSort<SortKey>({ key: 'missing', direction: 'desc' }, [
    'leave',
    'missing',
    'submitted',
  ])

  const sorted = useMemo(
    () =>
      sortRows(rows, sort, compareRows, (left, right) =>
        left.developer.name.localeCompare(right.developer.name),
      ),
    [rows, sort],
  )

  if (rows.length === 0) {
    return (
      <EmptyState
        message="Nobody you can see owes a daily update for this period."
        title="No employees to show"
        variant="filtered"
      />
    )
  }

  return (
    <div className="data-table__scroll">
      <table className="data-table missing-updates-table">
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
            <th scope="col">Days with nothing logged</th>
            {onRemind === undefined ? null : (
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {sorted.map((row) => (
            <tr key={row.developer.id}>
              <td className="data-table__nowrap">
                <Link to={`/developers/${row.developer.id}`}>{row.developer.name}</Link>
              </td>

              <td className="data-table__numeric">
                <span
                  className={
                    row.missingCount === 0
                      ? 'missing-updates-table__count'
                      : 'missing-updates-table__count missing-updates-table__count--behind'
                  }
                >
                  {row.missingCount}
                </span>
              </td>

              <td className="data-table__numeric">{row.leaveCount}</td>
              <td className="data-table__numeric">{row.submittedCount}</td>

              <td className="data-table__nowrap">
                {row.lastSubmittedDate === undefined
                  ? 'Not in this period'
                  : formatShortDate(row.lastSubmittedDate)}
              </td>

              <td className="missing-updates-table__days">
                {row.missingCount === 0 ? (
                  <span className="missing-updates-table__clear">Every day accounted for</span>
                ) : (
                  <>
                    {row.missingDates.slice(0, DATES_SHOWN).map((date) => (
                      <Tooltip key={date} label={formatLongDate(date)}>
                        <span className="missing-updates-table__chip">{formatShortDate(date)}</span>
                      </Tooltip>
                    ))}

                    {row.missingCount <= DATES_SHOWN ? null : (
                      <span className="missing-updates-table__chip missing-updates-table__chip--more">
                        +{row.missingCount - DATES_SHOWN}
                      </span>
                    )}
                  </>
                )}
              </td>

              {onRemind === undefined ? null : (
                <td>
                  <div className="row-actions">
                    <Button
                      disabled={row.missingCount === 0}
                      isLoading={remindingId === row.developer.id}
                      onClick={() => {
                        onRemind(row)
                      }}
                      size="small"
                      variant="secondary"
                    >
                      Send reminder
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
