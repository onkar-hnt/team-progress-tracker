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
}

/**
 * Read-only list of work entries.
 *
 * Shared by the dashboard, blocker panels and developer history so that an
 * entry looks and reads the same wherever it appears.
 */
export function EntryList({
  emptyMessage,
  entries,
  limit,
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

            <div className="entry-list__badges">
              <StatusBadge status={entry.status} />
              <PriorityBadge priority={entry.priority} />
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
