import { useMemo, useState } from 'react'

import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { MISSING_UPDATE_LOOKBACK_DAYS } from '@constants/team.constants'
import { useUpdateCoverage } from '@hooks/use-work-tracker'
import type { ReminderTarget } from '@models/notification.model'
import type { DropdownOption } from '@models/ui.model'
import { toUserMessage } from '@services/errors/error-message'
import type { DateRange } from '@utils/date.utils'
import {
  formatLongDate,
  getMonthRange,
  getTrailingRange,
  getWeekRange,
  shiftIsoDate,
  todayIsoDate,
} from '@utils/date.utils'
import type { DeveloperUpdateCoverage } from '@utils/update-coverage.utils'

import { MissingUpdatesTable } from '../components/MissingUpdatesTable'
import { ReminderDialog } from '../components/ReminderDialog'

import './MissingUpdatesPage.scss'

type PeriodId = 'fortnight' | 'month' | 'week'

const PERIOD_OPTIONS: readonly DropdownOption[] = [
  { value: 'fortnight', label: 'Last two weeks' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
]

/**
 * Every period ends yesterday.
 *
 * A day still in progress is not a day somebody has failed to account for, so
 * counting today would put the whole team in the list every morning. This is
 * why a week or a month that has only just begun can be empty: there is no
 * completed working day in it yet.
 */
function periodRange(period: PeriodId, today: string): DateRange {
  const yesterday = shiftIsoDate(today, -1)

  switch (period) {
    case 'fortnight':
      return getTrailingRange(yesterday, MISSING_UPDATE_LOOKBACK_DAYS)

    case 'week':
      return endingBy(getWeekRange(today), yesterday)

    case 'month':
      return endingBy(getMonthRange(today), yesterday)
  }
}

function endingBy(range: DateRange, last: string): DateRange {
  return { from: range.from, to: range.to > last ? last : range.to }
}

/**
 * Who is behind, over what period, and how to ask them.
 *
 * Scoped like every other team screen: a mentor sees the developers assigned
 * to them, an administrator sees everybody. The reminder is what turns the list
 * into something actionable, and it is the same authorisation on the server.
 */
export function MissingUpdatesPage() {
  const today = todayIsoDate()

  const [period, setPeriod] = useState<PeriodId>('fortnight')
  const [reminding, setReminding] = useState<ReminderTarget | null>(null)

  const range = useMemo(() => periodRange(period, today), [period, today])
  const coverageQuery = useUpdateCoverage(range)

  const coverage = coverageQuery.data
  const rows = coverage?.developers ?? []
  const totals = coverage?.totals

  const isLoading = coverageQuery.isPending
  const pendingStat = isLoading ? '…' : coverageQuery.error !== null ? '—' : null

  const remind = (row: DeveloperUpdateCoverage) => {
    setReminding({
      developerId: row.developer.id,
      developerName: row.developer.name,
      missingDates: row.missingDates,
    })
  }

  return (
    <div className="missing-updates">
      <Panel
        action={
          <Dropdown
            id="missing-updates-period"
            onChange={(next) => {
              setPeriod(next as PeriodId)
            }}
            options={PERIOD_OPTIONS}
            value={period}
          />
        }
        description={`Working days from ${formatLongDate(range.from)} to ${formatLongDate(range.to)} with no daily update and no leave recorded.`}
        isPageHeading
        title="Missing updates"
      >
        {coverageQuery.error === null ? null : (
          <ErrorState
            message={toUserMessage(
              coverageQuery.error,
              'The missing updates could not be loaded.',
            )}
            onRetry={() => void coverageQuery.refetch()}
          />
        )}

        <div className="missing-updates__stats stat-card-grid">
          <StatCard
            icon="users"
            label="Employees behind"
            tone={(totals?.developersWithGaps ?? 0) > 0 ? 'attention' : 'positive'}
            value={pendingStat ?? totals?.developersWithGaps ?? 0}
            {...(rows.length === 0 ? {} : { detail: `of ${String(rows.length)} tracked` })}
          />
          <StatCard
            icon="alert"
            label="Missing days"
            tone={(totals?.missingDays ?? 0) > 0 ? 'attention' : 'neutral'}
            value={pendingStat ?? totals?.missingDays ?? 0}
          />
          <StatCard
            icon="calendar"
            label="Days marked as leave"
            value={pendingStat ?? totals?.leaveDays ?? 0}
          />
        </div>
      </Panel>

      <Panel
        description="One row per employee. Sort any column, or send a reminder to somebody with days outstanding."
        fills={rows.length > 0}
        title="By employee"
      >
        {coverageQuery.error !== null ? (
          <ErrorState
            message={toUserMessage(
              coverageQuery.error,
              'The missing updates could not be loaded.',
            )}
            onRetry={() => void coverageQuery.refetch()}
          />
        ) : isLoading ? (
          <Skeleton label="Working out who is behind…" rows={6} />
        ) : (
          <MissingUpdatesTable onRemind={remind} rows={rows} />
        )}
      </Panel>

      <ReminderDialog
        onClose={() => {
          setReminding(null)
        }}
        target={reminding}
      />
    </div>
  )
}
