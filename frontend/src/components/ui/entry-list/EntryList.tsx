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

  /** Initial page size; omitted shows the full list. */
  limit?: number

  renderActions?: (entry: DailyWorkEntryView) => ReactNode
}

export function EntryList({
  emptyMessage,
  entries,
  limit,
  renderActions,
  showDate = false,
  showDeveloper = true,
}: EntryListProps) {
  // Not reset on entries refresh — collapsing mid-read is worse than extra rows.
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
          total={entries.length}
        />
      )}
    </>
  )
}
