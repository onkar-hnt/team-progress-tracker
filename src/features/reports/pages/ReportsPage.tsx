import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  DeveloperProgressChart,
  HoursByDayChart,
  ProjectDistributionChart,
  StatusDistributionChart,
  WeeklyTrendChart,
} from '@components/charts/WorkCharts'
import { DeveloperSummaryTable, ProjectSummaryTable } from '@components/summaries/SummaryTables'
import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { FilterField } from '@components/ui/field/Field'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { EntryList } from '@components/ui/entry-list/EntryList'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { DeveloperReportPanel } from '@features/reports/components/DeveloperReportPanel'
import type { ActivitySlice } from '@features/team-activity/activity-filters'
import { activityRangeLink } from '@features/team-activity/activity-filters'
import { useDevelopers, useProjects, useRangeOverview } from '@hooks/use-work-tracker'
import { downloadCsv, toCsv } from '@utils/csv.utils'
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

import { buildEntriesCsv } from '../hooks/use-developer-report'
import {
  buildDeveloperTotalsCsv,
  buildProjectTotalsCsv,
  buildTeamReportFilename,
} from '../team-report-csv'

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

const PERIOD_OPTIONS = Object.entries(PERIODS).map(([key, period]) => ({
  value: key,
  label: period.label,
}))

export function ReportsPage() {
  const navigate = useNavigate()

  const [periodKey, setPeriodKey] = useState<PeriodKey>('this-week')
  const [customRange, setCustomRange] = useState<DateRange>(() => getWeekRange(todayIsoDate()))

  const range = useMemo(
    () => (periodKey === 'custom' ? customRange : PERIODS[periodKey].resolve(todayIsoDate())),
    [customRange, periodKey],
  )

  const rangeQuery = useRangeOverview(range)
  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()

  /**
   * From a chart on this screen to the rows it counted.
   *
   * A report answers "how much"; the next question is invariably "which ones", and until now
   * that meant going to the activity screen and rebuilding the same period and filter by hand.
   * The period travels with the link, so the list opens on exactly what was on show here.
   *
   * Unconditional, unlike the dashboard's version: this whole screen is behind team access, so
   * anybody reading it can read the activity list too.
   */
  const openActivity = (slice: ActivitySlice) => {
    void navigate(activityRangeLink(range, slice))
  }

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

  /**
   * One download, from what is already on screen.
   *
   * Nothing is fetched: the rows handed in are the rows the panel is showing, so a
   * file cannot disagree with the table it was downloaded from. Refused while the
   * period is still loading, which is why every caller is behind the same
   * `isLoading` guard the tables are.
   */
  const exportCsv = (part: string, rows: string[][]) => {
    downloadCsv(buildTeamReportFilename(part, range), toCsv(rows))
  }

  const exportButton = (label: string, part: string, rows: () => string[][]) => (
    <Button
      disabled={isLoading}
      icon="download"
      onClick={() => {
        exportCsv(part, rows())
      }}
      size="small"
      variant="secondary"
    >
      {label}
    </Button>
  )

  const periodPicker = (
    <div className="reports__controls">
      {/* Beside the period rather than in each panel heading, because what it
          exports is the period: the file is named after the dates chosen here,
          and the rows are every entry inside them. */}
      {exportButton('Export entries', 'entries', () => buildEntriesCsv(entries))}

      <FilterField label="Period">
        <Dropdown
          ariaLabel="Period"
          onChange={(next) => setPeriodKey(next as PeriodKey)}
          options={PERIOD_OPTIONS}
          value={periodKey}
        />
      </FilterField>

      {periodKey === 'custom' ? (
        <>
          <FilterField label="From">
            <input
              max={customRange.to}
              onChange={(event) =>
                setCustomRange((current) => ({ ...current, from: event.target.value }))
              }
              type="date"
              value={customRange.from}
            />
          </FilterField>

          <FilterField label="To">
            <input
              min={customRange.from}
              onChange={(event) =>
                setCustomRange((current) => ({ ...current, to: event.target.value }))
              }
              type="date"
              value={customRange.to}
            />
          </FilterField>
        </>
      ) : null}
    </div>
  )

  // The per-developer report is rendered here too. It reads a different query,
  // so a failure in the period analytics is no reason to withhold it — and it is
  // the one thing on this screen somebody may have come specifically to do.
  if (error !== null) {
    return (
      <div className="reports">
        <Panel isPageHeading title="Reports">
          <ErrorState
            message={`The period analytics could not be loaded: ${error.message}`}
            onRetry={() => void rangeQuery.refetch()}
          />
        </Panel>

        <DeveloperReportPanel />
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
            <StatCard
              icon="tasks"
              label="Total tasks"
              tone="progress"
              value={rangeQuery.data?.statuses.total ?? 0}
            />
            <StatCard
              icon="check"
              label="Completed"
              tone="positive"
              value={rangeQuery.data?.statuses.completed ?? 0}
            />
            <StatCard
              icon="activity"
              label="In progress"
              value={rangeQuery.data?.statuses.inProgress ?? 0}
            />
            <StatCard
              icon="tasks"
              label="Not started"
              value={rangeQuery.data?.statuses.notStarted ?? 0}
            />
            <StatCard
              icon="alert"
              label="Needs attention"
              tone={(rangeQuery.data?.statuses.needsAttention ?? 0) > 0 ? 'attention' : 'neutral'}
              value={rangeQuery.data?.statuses.needsAttention ?? 0}
            />
            {/* The two rates carry bars, and the counts around them do not. A rate is
                a proportion of something stated, which is what a bar can draw; "Hours
                logged" is a quantity with no ceiling to measure it against. */}
            <StatCard
              icon="chart"
              label="Completion rate"
              progress={rangeQuery.data?.completionRate ?? 0}
              tone="progress"
              value={`${String(rangeQuery.data?.completionRate ?? 0)}%`}
            />
            <StatCard
              icon="chart"
              label="Hours logged"
              value={rangeQuery.data?.hoursLogged ?? 0}
            />
            <StatCard
              detail={`${String(submittedUpdates)} of ${String(expectedUpdates)} expected`}
              icon="users"
              label="Update rate"
              progress={updateRate}
              tone={updateRate < 80 ? 'attention' : 'positive'}
              value={`${String(updateRate)}%`}
            />
          </div>
        )}
      </Panel>

      {/* Above the period analytics, because generating one person's report is a
          deliberate errand somebody arrives with, while the figures below are
          what they read when they arrive without one. It carries its own filters
          and is unaffected by the period picker in the heading. */}
      <DeveloperReportPanel />

      <Panel
        action={exportButton('Export', 'developers', () =>
          buildDeveloperTotalsCsv(developerSummaries),
        )}
        description="Totals per developer for the selected period."
        title="Developer totals"
      >
        {isLoading ? <Skeleton rows={5} /> : <DeveloperSummaryTable summaries={developerSummaries} />}
      </Panel>

      <Panel
        action={exportButton('Export', 'projects', () => buildProjectTotalsCsv(projectSummaries))}
        description="Totals per project for the selected period."
        title="Project report"
      >
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
            <StatusDistributionChart
              onSelectStatus={(status) => {
                openActivity({ status })
              }}
              statuses={rangeQuery.data.statuses}
            />
          )}
        </Panel>
      </div>

      <div className="reports__row">
        <Panel description="Stacked task status per developer." title="Developer comparison">
          {isLoading ? (
            <Skeleton rows={4} />
          ) : (
            <DeveloperProgressChart
              onSelectDeveloper={(developerId) => {
                openActivity({ developerId })
              }}
              summaries={developerSummaries}
            />
          )}
        </Panel>

        <Panel description="Effort distribution across projects." title="Project distribution">
          {isLoading ? (
            <Skeleton rows={4} />
          ) : (
            <ProjectDistributionChart
              onSelectProject={(projectId) => {
                openActivity({ projectId })
              }}
              summaries={projectSummaries}
            />
          )}
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
            <EmptyState
              icon="check"
              message="Every active developer logged work in this period."
              title="Full coverage"
            />
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
