import { useMemo } from 'react'

import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { MISSING_UPDATE_LOOKBACK_DAYS } from '@constants/team.constants'
import {
  useClearLeaveDay,
  useLeaveDays,
  useMarkLeaveDay,
  useUpdateCoverage,
} from '@hooks/use-work-tracker'
import { toUserMessage } from '@services/errors/error-message'
import {
  formatLongDate,
  formatWeekday,
  getTrailingRange,
  shiftIsoDate,
  todayIsoDate,
} from '@utils/date.utils'
import { findCoverageFor, findPendingDays } from '@utils/update-coverage.utils'

import './PendingUpdates.scss'

interface PendingUpdatesProps {
  developerId: string

  /** The day the form is currently filling in. */
  activeDate: string

  onPickDate: (date: string) => void
}

/**
 * The days behind, and the two ways to answer them.
 *
 * Ends yesterday: today is what the form above is for, and a day still in
 * progress is not a day somebody has failed to account for.
 */
export function PendingUpdates({ activeDate, developerId, onPickDate }: PendingUpdatesProps) {
  const snackbar = useSnackbar()
  const today = todayIsoDate()

  const range = useMemo(
    () => getTrailingRange(shiftIsoDate(today, -1), MISSING_UPDATE_LOOKBACK_DAYS),
    [today],
  )

  const query = useMemo(
    () => ({ dateFrom: range.from, dateTo: range.to, developerIds: [developerId] }),
    [developerId, range],
  )

  const coverageQuery = useUpdateCoverage(query)
  const leaveQuery = useLeaveDays(query)

  const markLeave = useMarkLeaveDay()
  const clearLeave = useClearLeaveDay()

  const coverage = findCoverageFor(coverageQuery.data, developerId)
  const pending = findPendingDays(coverage)
  const leaveDays = leaveQuery.data ?? []

  if (coverageQuery.isPending) {
    return (
      <Panel title="Days waiting for an update">
        <Skeleton label="Checking the last two weeks…" rows={2} />
      </Panel>
    )
  }

  if (coverageQuery.error !== null) {
    return (
      <Panel title="Days waiting for an update">
        <ErrorState
          message={toUserMessage(
            coverageQuery.error,
            'Your recent days could not be checked right now.',
          )}
          onRetry={() => void coverageQuery.refetch()}
        />
      </Panel>
    )
  }

  const isBusy = markLeave.isPending || clearLeave.isPending

  return (
    <Panel
      description={`Working days since ${formatLongDate(range.from)} with nothing logged.`}
      title="Days waiting for an update"
    >
      {pending.length === 0 ? (
        <p className="pending-updates__clear">
          Every working day in the last two weeks is accounted for.
        </p>
      ) : (
        <ul className="pending-updates__list">
          {pending.map((day) => (
            <li
              className={
                day.date === activeDate
                  ? 'pending-updates__day pending-updates__day--active'
                  : 'pending-updates__day'
              }
              key={day.date}
            >
              <span className="pending-updates__when">
                <span className="pending-updates__weekday">{formatWeekday(day.date)}</span>
                <span className="pending-updates__date">{formatLongDate(day.date)}</span>
              </span>

              <span className="pending-updates__actions">
                <Button
                  disabled={isBusy}
                  onClick={() => {
                    onPickDate(day.date)
                  }}
                  size="small"
                  variant={day.date === activeDate ? 'primary' : 'secondary'}
                >
                  {day.date === activeDate ? 'Filling this in' : 'Add the update'}
                </Button>

                <Button
                  disabled={isBusy}
                  onClick={() => {
                    markLeave.mutate(
                      { developerId, date: day.date },
                      {
                        onSuccess: () => {
                          snackbar.success(`${formatLongDate(day.date)} is marked as leave.`)
                          if (day.date === activeDate) onPickDate(today)
                        },
                      },
                    )
                  }}
                  size="small"
                  variant="ghost"
                >
                  I was on leave
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {leaveDays.length === 0 ? null : (
        <div className="pending-updates__leave">
          <h3 className="pending-updates__leave-heading">Marked as leave</h3>

          <ul className="pending-updates__leave-list">
            {leaveDays.map((leaveDay) => (
              <li className="pending-updates__leave-day" key={leaveDay.id}>
                <span>{formatLongDate(leaveDay.date)}</span>

                <Button
                  disabled={isBusy}
                  onClick={() => {
                    clearLeave.mutate(leaveDay.id, {
                      onSuccess: () => {
                        snackbar.success(
                          `${formatLongDate(leaveDay.date)} is no longer marked as leave.`,
                        )
                      },
                    })
                  }}
                  size="small"
                  variant="ghost"
                >
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
