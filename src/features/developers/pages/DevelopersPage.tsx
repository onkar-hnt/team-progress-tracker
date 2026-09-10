import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { DeveloperSummaryTable } from '@components/summaries/SummaryTables'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { MENTOR } from '@constants/team.constants'
import { useDevelopers, useRangeOverview } from '@hooks/use-work-tracker'
import { formatLongDate, getMonthRange, getTrailingRange, getWeekRange, todayIsoDate } from '@utils/date.utils'
import { buildDeveloperSummaries } from '@utils/work-summary.utils'

import './DevelopersPage.scss'

const PERIODS = {
  'this-week': { label: 'This week', resolve: getWeekRange },
  'this-month': { label: 'This month', resolve: getMonthRange },
  'last-30-days': { label: 'Last 30 days', resolve: (date: string) => getTrailingRange(date, 30) },
} as const

type PeriodKey = keyof typeof PERIODS

export function DevelopersPage() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('this-week')

  const range = PERIODS[periodKey].resolve(todayIsoDate())
  const developersQuery = useDevelopers()
  const rangeQuery = useRangeOverview(range)

  const summaries = useMemo(
    () => buildDeveloperSummaries(developersQuery.data ?? [], rangeQuery.data?.entries ?? []),
    [developersQuery.data, rangeQuery.data],
  )

  const error = developersQuery.error ?? rangeQuery.error
  const isLoading = developersQuery.isPending || rangeQuery.isPending

  const periodPicker = (
    <label className="developers__period">
      <span>Period</span>
      <select onChange={(event) => setPeriodKey(event.target.value as PeriodKey)} value={periodKey}>
        {Object.entries(PERIODS).map(([key, period]) => (
          <option key={key} value={key}>
            {period.label}
          </option>
        ))}
      </select>
    </label>
  )

  if (error !== null) {
    return (
      <div className="developers">
        <Panel isPageHeading title="Developers">
          <ErrorState
            message={`The team list could not be loaded: ${error.message}`}
            onRetry={() => void developersQuery.refetch()}
          />
        </Panel>
      </div>
    )
  }

  // Inactive developers are kept visible but pushed to the end, so history
  // stays reachable without cluttering the active team.
  const ordered = [...summaries].sort((left, right) => {
    if (left.developer.active !== right.developer.active) return left.developer.active ? -1 : 1
    return left.developer.name.localeCompare(right.developer.name)
  })

  return (
    <div className="developers">
      <Panel
        action={periodPicker}
        description={`${formatLongDate(range.from)} to ${formatLongDate(range.to)}. Mentor: ${MENTOR.name}.`}
        isPageHeading
        title="Developers"
      >
        {isLoading ? (
          <Skeleton label="Loading the team…" rows={4} />
        ) : ordered.length === 0 ? (
          <EmptyState message="No developers are configured yet." />
        ) : (
          <ul className="developers__grid">
            {ordered.map((summary) => (
              <li key={summary.developer.id}>
                <Link className="developer-card" to={`/developers/${summary.developer.id}`}>
                  <span className="developer-card__header">
                    <span className="developer-card__name">{summary.developer.name}</span>
                    {summary.developer.active ? null : (
                      <span className="developer-card__inactive">Inactive</span>
                    )}
                  </span>

                  <span className="developer-card__role">
                    {summary.developer.role ?? 'Developer'}
                    {summary.developer.location === undefined
                      ? ''
                      : ` · ${summary.developer.location}`}
                  </span>

                  <span className="developer-card__metrics">
                    <span>
                      <strong>{summary.statuses.total}</strong> tasks
                    </span>
                    <span>
                      <strong>{summary.statuses.completed}</strong> done
                    </span>
                    <span>
                      <strong>{summary.completionRate}%</strong> rate
                    </span>
                    <span>
                      <strong>{summary.hoursLogged}</strong> hours
                    </span>
                  </span>

                  {summary.statuses.needsAttention > 0 ? (
                    <span className="developer-card__attention">
                      {summary.statuses.needsAttention} blocked
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel description="Every developer's totals for the selected period." title="Comparison">
        {isLoading ? <Skeleton rows={4} /> : <DeveloperSummaryTable summaries={summaries} />}
      </Panel>
    </div>
  )
}
