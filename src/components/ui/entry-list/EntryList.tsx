import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import { EmptyState } from '@components/ui/feedback/Feedback'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { formatShortDate } from '@utils/date.utils'

import './EntryList.scss'

interface EntryListProps {
  entries: readonly DailyWorkEntryView[]
  emptyMessage: string

  /** Hidden on a developer's own page, where every row is the same person. */
  showDeveloper?: boolean

  showDate?: boolean

  /** Caps long lists; the caller decides whether to link to the full view. */
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
  if (entries.length === 0) return <EmptyState message={emptyMessage} />

  const visible = limit === undefined ? entries : entries.slice(0, limit)

  return (
    <>
      <ul className="entry-list">
        {visible.map((entry) => (
          <li className="entry-list__item" key={entry.id}>
            <div className="entry-list__main">
              <p className="entry-list__title">{entry.taskTitle}</p>
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
                <p className="entry-list__blocker">{entry.blockerDescription}</p>
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

      {limit !== undefined && entries.length > limit ? (
        <p className="entry-list__more">
          Showing {limit} of {entries.length} entries.
        </p>
      ) : null}
    </>
  )
}
