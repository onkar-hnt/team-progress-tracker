import { useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import { useDailyWorkEntries, useDeleteDailyWorkEntry } from '@hooks/use-work-tracker'
import { canDeleteEntry, isAdmin } from '@services/auth/index'
import { formatLongDate } from '@utils/date.utils'

import './DailyUpdateEntries.scss'

interface DailyUpdateEntriesProps {
  date: string
}

/**
 * The entries already logged for the selected date.
 *
 * Showing these next to the form answers "did my update save?" and "have I
 * already logged this?" without navigating away, which is what makes logging
 * several tasks in a row workable.
 *
 * A developer sees only their own entries; the mentor sees the whole team's,
 * because those are the two useful views of the same day.
 */
export function DailyUpdateEntries({ date }: DailyUpdateEntriesProps) {
  const { user } = useAuth()
  const deleteEntry = useDeleteDailyWorkEntry()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const showsWholeTeam = isAdmin(user)
  const ownDeveloperId = user?.developerId

  const entriesQuery = useDailyWorkEntries({
    dateFrom: date,
    dateTo: date,
    ...(showsWholeTeam || ownDeveloperId === undefined
      ? {}
      : { developerIds: [ownDeveloperId] }),
  })

  const handleDelete = async (id: string) => {
    setDeleteError(null)

    try {
      await deleteEntry.mutateAsync(id)
      setPendingDeleteId(null)
    } catch {
      setDeleteError('The entry could not be deleted. Please try again.')
    }
  }

  if (entriesQuery.isPending) {
    return <p className="daily-update-entries__status">Loading entries…</p>
  }

  if (entriesQuery.error !== null) {
    return (
      <p className="daily-update-entries__status" role="alert">
        Entries could not be loaded: {entriesQuery.error.message}
      </p>
    )
  }

  const entries = entriesQuery.data ?? []

  if (entries.length === 0) {
    return (
      <p className="daily-update-entries__status">
        No updates logged for {formatLongDate(date)} yet.
      </p>
    )
  }

  return (
    <div className="daily-update-entries">
      {deleteError === null ? null : (
        <p className="daily-update-entries__alert" role="alert">
          {deleteError}
        </p>
      )}

      <ul className="daily-update-entries__list">
        {entries.map((entry) => (
          <li className="daily-update-entries__item" key={entry.id}>
            <div className="daily-update-entries__main">
              <p className="daily-update-entries__title">{entry.taskTitle}</p>
              <p className="daily-update-entries__meta">
                {showsWholeTeam ? `${entry.developerName} · ` : ''}
                {entry.projectName}
                {entry.hoursSpent === undefined ? '' : ` · ${entry.hoursSpent}h`}
                {` · ${entry.progress}%`}
              </p>
              {entry.blockerDescription === undefined ? null : (
                <p className="daily-update-entries__blocker">Blocked: {entry.blockerDescription}</p>
              )}
            </div>

            <div className="daily-update-entries__badges">
              <StatusBadge status={entry.status} />
              <PriorityBadge priority={entry.priority} />
            </div>

            {canDeleteEntry(user, entry) ? (
              <div className="daily-update-entries__actions">
                {pendingDeleteId === entry.id ? (
                  <>
                    {/* Two-step rather than a browser confirm, so the action
                        stays inside the page and is keyboard friendly. */}
                    <button
                      className="daily-update-entries__confirm"
                      disabled={deleteEntry.isPending}
                      onClick={() => void handleDelete(entry.id)}
                      type="button"
                    >
                      {deleteEntry.isPending ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      className="daily-update-entries__cancel"
                      onClick={() => setPendingDeleteId(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="daily-update-entries__delete"
                    onClick={() => setPendingDeleteId(entry.id)}
                    type="button"
                  >
                    Delete
                  </button>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
