import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import { EmptyState } from '@components/ui/feedback/Feedback'
import { ShowMore } from '@components/ui/show-more/ShowMore'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { formatShortDate } from '@utils/date.utils'

import './EntryList.scss'

interface EntryListProps {
  entries: readonly DailyWorkEntryView[]
  emptyMessage: string

  /** Hidden on a developer's own page, where every row is the same person. */
  showDeveloper?: boolean

  showDate?: boolean

  /**
   * How many entries to show before offering the rest.
   *
   * A page rather than a cap. It used to be a hard limit with "Showing 20 of 63
   * entries." underneath — which told somebody that forty-three entries existed
   * and gave them no way to reach any of them. The number is now what arrives
   * first, and the rest are a button away.
   *
   * Left out, everything is shown, which is right for a panel whose whole purpose
   * is the full list.
   */
  limit?: number

  /**
   * Rendered beside the badges, for the actions a given screen allows.
   *
   * Omitted on the reporting screens, where an entry is evidence rather than
   * something to change. The caller decides per entry, so the permission
   * check stays with the screen that knows who is looking.
   */
  renderActions?: (entry: DailyWorkEntryView) => ReactNode
}

/**
 * A list of work entries.
 *
 * Shared by the dashboard, blocker panels and developer history so that an
 * entry looks and reads the same wherever it appears.
 */
export function EntryList({
  emptyMessage,
  entries,
  limit,
  renderActions,
  showDate = false,
  showDeveloper = true,
}: EntryListProps) {
  /**
   * How many extra pages have been asked for.
   *
   * Pages rather than a row count, so the state means the same thing if `limit`
   * ever changes, and deliberately not reset when `entries` changes: these lists
   * refetch on focus and on every realtime event, and collapsing an expanded list
   * under somebody because a background refresh landed is worse than showing more
   * rows of a list they have since filtered.
   */
  const [extraPages, setExtraPages] = useState(0)

  if (entries.length === 0) return <EmptyState message={emptyMessage} />

  const shown =
    limit === undefined ? entries.length : Math.min(limit * (extraPages + 1), entries.length)
  const visible = entries.slice(0, shown)
  const remaining = entries.length - shown

  return (
    <>
      <ul className="entry-list">
        {visible.map((entry) => (
          <li className="entry-list__item" key={entry.id}>
            <div className="entry-list__main">
              {/* One line, cut off rather than wrapped. These panels are often a
                  narrow column, and a long update wrapped to four lines pushed
                  the badges and controls below the fold of the card. */}
              <p className="entry-list__title">
                <Tooltip clips label={entry.taskTitle}>
                  {entry.taskTitle}
                </Tooltip>
              </p>
              <p className="entry-list__meta">
                {showDeveloper ? (
                  <Link className="entry-list__link" to={`/developers/${entry.developerId}`}>
                    {entry.developerName}
                  </Link>
                ) : null}
                {showDeveloper ? ' · ' : ''}
                {entry.projectName}
                {showDate ? ` · ${formatShortDate(entry.date)}` : ''}
                {` · ${String(entry.progress)}%`}
                {entry.hoursSpent === undefined ? '' : ` · ${String(entry.hoursSpent)}h`}
              </p>
              {entry.blockerDescription === undefined ? null : (
                <p className="entry-list__blocker">
                  <Tooltip clips label={entry.blockerDescription}>
                    {entry.blockerDescription}
                  </Tooltip>
                </p>
              )}
            </div>

            {/* Badges and controls sit under the title rather than beside it.
                These panels are often a narrow column of a two-column row,
                and competing for the same line left the title wrapping one
                word at a time. */}
            <div className="entry-list__footer">
              <div className="entry-list__badges">
                <StatusBadge status={entry.status} />
                <PriorityBadge priority={entry.priority} />
              </div>

              {renderActions === undefined ? null : (
                <div className="entry-list__actions">{renderActions(entry)}</div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {remaining === 0 ? null : (
        <ShowMore
          noun="entries"
          onShowMore={() => {
            setExtraPages((current) => current + 1)
          }}
          pageSize={limit ?? remaining}
          shown={shown}
          // Known here, unlike on the server-paged screens: this component was given
          // the whole list and is choosing how much of it to draw.
          total={entries.length}
        />
      )}
    </>
  )
}
