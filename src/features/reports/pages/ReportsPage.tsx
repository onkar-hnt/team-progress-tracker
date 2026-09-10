import { useMemo, useState } from 'react'

import {
  DeveloperProgressChart,
  HoursByDayChart,
  ProjectDistributionChart,
  StatusDistributionChart,
  WeeklyTrendChart,
} from '@components/charts/WorkCharts'
import { DeveloperSummaryTable, ProjectSummaryTable } from '@components/summaries/SummaryTables'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { EntryList } from '@components/ui/entry-list/EntryList'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { useDevelopers, useProjects, useRangeOverview } from '@hooks/use-work-tracker'
import type { DateRange } from '@utils/date.utils'
import {
  formatLongDate,
  getMonthRange,
  getSingleDayRange,
  getTrailingRange,
  getWeekRange,
  listWorkingDatesInRange,
  todayIsoDate,
} from '@utils/date.utils'
import { buildDeveloperSummaries, buildProjectSummaries } from '@utils/work-summary.utils'

import './ReportsPage.scss'

const PERIODS = {
  today: { label: 'Today', resolve: getSingleDayRange },
  'this-week': { label: 'This week', resolve: getWeekRange },
  'last-7-days': { label: 'Last 7 days', resolve: (date: string) => getTrailingRange(date, 7) },
  'this-month': { label: 'This month', resolve: getMonthRange },
  'last-30-days': { label: 'Last 30 days', resolve: (date: string) => getTrailingRange(date, 30) },
  custom: { label: 'Custom range', resolve: getSingleDayRange },
} as const

type PeriodKey = keyof typeof PERIODS

export function ReportsPage() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('this-week')
  const [customRange, setCustomRange] = useState<DateRange>(() => getWeekRange(todayIsoDate()))

  const range = useMemo(
    () => (periodKey === 'custom' ? customRange : PERIODS[periodKey].resolve(todayIsoDate())),
    [customRange, periodKey],
  )

  const rangeQuery = useRangeOverview(range)
  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()

  // Stable identity so the summaries below are only recomputed on new data.
  const entries = useMemo(() => rangeQuery.data?.entries ?? [], [rangeQuery.data])

  const developerSummaries = useMemo(
    () => buildDeveloperSummaries(developersQuery.data ?? [], entries),
    [developersQuery.data, entries],
  )

  const projectSummaries = useMemo(
    () => buildProjectSummaries(projectsQuery.data ?? [], entries),
    [entries, projectsQuery.data],
  )

  const error = rangeQuery.error ?? developersQuery.error ?? projectsQuery.error
  const isLoading = rangeQuery.isPending || developersQuery.isPending

  // Consistency is measured against the number of working days in the period,
  // so a report covering a weekend does not look like everyone stopped work.
  const workingDays = listWorkingDatesInRange(range).length
  const activeDevelopers = (developersQuery.data ?? []).filter((developer) => developer.active)
  const expectedUpdates = workingDays * activeDevelopers.length
  const submittedUpdates = new Set(
    entries.map((entry) => `${entry.date}|${entry.developerId}`),
  ).size
  const updateRate =
    expectedUpdates === 0 ? 0 : Math.round((submittedUpdates / expectedUpdates) * 1000) / 10

  const inactiveDevelopers = developerSummaries.filter(
    (summary) => summary.developer.active && summary.statuses.total === 0,
  )

  const periodPicker = (
    <div className="reports__controls">
      <label className="reports__field">
        <span>Period</span>
        <select
          onChange={(event) => setPeriodKey(event.target.value as PeriodKey)}
          value={periodKey}
        >
          {Object.entries(PERIODS).map(([key, period]) => (
            <option key={key} value={key}>
              {period.label}
            </option>
          ))}
        </select>
      </label>

      {periodKey === 'custom' ? (
        <>
          <label className="reports__field">
            <span>From</span>
            <input
              max={customRange.to}
              onChange={(event) =>
                setCustomRange((current) => ({ ...current, from: event.target.value }))
              }
              type="date"
              value={customRange.from}
            />
          </label>

          <label className="reports__field">
            <span>To</span>
            <input
              min={customRange.from}
              onChange={(event) =>
                setCustomRange((current) => ({ ...current, to: event.target.value }))
              }
              type="date"
              value={customRange.to}
            />
          </label>
        </>
      ) : null}
    </div>
  )

  if (error !== null) {
    return (
      <div className="reports">
        <Panel isPageHeading title="Reports">
          <ErrorState
            message={`The report could not be generated: ${error.message}`}
            onRetry={() => void rangeQuery.refetch()}
          />
        </Panel>
      </div>
    )
  }

  return (
    <div className="reports">
      <Panel
        action={periodPicker}
        description={`${formatLongDate(range.from)} to ${formatLongDate(range.to)} · ${String(workingDays)} working days.`}
        isPageHeading
        title="Reports"
      >
        {isLoading ? (
          <Skeleton label="Generating the report…" rows={4} />
        ) : (
          <div className="stat-card-grid">
            <StatCard label="Total tasks" tone="progress" value={rangeQuery.data?.statuses.total ?? 0} />
            <StatCard
              label="Completed"
              tone="positive"
              value={rangeQuery.data?.statuses.completed ?? 0}
            />
            <StatCard label="In progress" value={rangeQuery.data?.statuses.inProgress ?? 0} />
            <StatCard label="Not started" value={rangeQuery.data?.statuses.notStarted ?? 0} />
            <StatCard
              label="Needs attention"
              tone={(rangeQuery.data?.statuses.needsAttention ?? 0) > 0 ? 'attention' : 'neutral'}
              value={rangeQuery.data?.statuses.needsAttention ?? 0}
            />
            <StatCard
              label="Completion rate"
              value={`${String(rangeQuery.data?.completionRate ?? 0)}%`}
            />
            <StatCard label="Hours logged" value={rangeQuery.data?.hoursLogged ?? 0} />
            <StatCard
              label="Update rate"
              tone={updateRate < 80 ? 'attention' : 'positive'}
              value={`${String(updateRate)}%`}
              detail={`${String(submittedUpdates)} of ${String(expectedUpdates)} expected`}
            />
          </div>
        )}
      </Panel>

      <Panel description="Totals per developer for the selected period." title="Developer report">
        {isLoading ? <Skeleton rows={5} /> : <DeveloperSummaryTable summaries={developerSummaries} />}
      </Panel>

      <Panel description="Totals per project for the selected period." title="Project report">
        {isLoading ? <Skeleton rows={4} /> : <ProjectSummaryTable summaries={projectSummaries} />}
      </Panel>

      <div className="reports__row">
        <Panel description="Task volume and outcomes over time." title="Trend">
          {isLoading ? <Skeleton rows={4} /> : <WeeklyTrendChart trend={rangeQuery.data?.trend ?? []} />}
        </Panel>

        <Panel description="Status split across the period." title="Task status">
          {isLoading || rangeQuery.data === undefined ? (
            <Skeleton rows={4} />
          ) : (
            <StatusDistributionChart statuses={rangeQuery.data.statuses} />
          )}
        </Panel>
      </div>

      <div className="reports__row">
        <Panel description="Stacked task status per developer." title="Developer comparison">
          {isLoading ? <Skeleton rows={4} /> : <DeveloperProgressChart summaries={developerSummaries} />}
        </Panel>

        <Panel description="Effort distribution across projects." title="Project distribution">
          {isLoading ? <Skeleton rows={4} /> : <ProjectDistributionChart summaries={projectSummaries} />}
        </Panel>
      </div>

      <Panel description="Hours logged each day of the period." title="Hours logged">
        {isLoading ? <Skeleton rows={3} /> : <HoursByDayChart trend={rangeQuery.data?.trend ?? []} />}
      </Panel>

      <div className="reports__row">
        <Panel description="Every blocker raised in the period." title="Blocker report">
          {isLoading ? (
            <Skeleton rows={3} />
          ) : (
            <EntryList
              emptyMessage="No blockers were raised in this period."
              entries={rangeQuery.data?.blockedEntries ?? []}
              showDate
            />
          )}
        </Panel>

        <Panel
          description="Active developers with no entry at all in this period."
          title="No activity logged"
        >
          {isLoading ? (
            <Skeleton rows={3} />
          ) : inactiveDevelopers.length === 0 ? (
            <EmptyState message="Every active developer logged work in this period." />
          ) : (
            <ul className="reports__list">
              {inactiveDevelopers.map((summary) => (
                <li key={summary.developer.id}>
                  {summary.developer.name}
                  <span>{summary.developer.role ?? 'Developer'}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
