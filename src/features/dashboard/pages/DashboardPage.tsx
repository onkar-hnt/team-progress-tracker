import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  DeveloperProgressChart,
  HoursByDayChart,
  ProjectDistributionChart,
  StatusDistributionChart,
  WeeklyTrendChart,
} from '@components/charts/WorkCharts'
import { DeveloperSummaryTable } from '@components/summaries/SummaryTables'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { EntryList } from '@components/ui/entry-list/EntryList'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { MENTOR } from '@constants/team.constants'
import { useDayOverview, useDevelopers, useProjects, useRangeOverview } from '@hooks/use-work-tracker'
import {
  formatLongDate,
  getWeekRange,
  isWorkingDay,
  toNearestWorkingDay,
  todayIsoDate,
} from '@utils/date.utils'
import { buildDeveloperSummaries, buildProjectSummaries } from '@utils/work-summary.utils'

import './DashboardPage.scss'

export function DashboardPage() {
  // Opening on a weekend should show the last working day rather than an
  // empty screen, so the default is nudged back to a working day.
  const [selectedDate, setSelectedDate] = useState(() => toNearestWorkingDay(todayIsoDate()))

  const weekRange = getWeekRange(selectedDate)

  const dayQuery = useDayOverview(selectedDate)
  const weekQuery = useRangeOverview(weekRange)
  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()

  const developerSummaries = useMemo(
    () => buildDeveloperSummaries(developersQuery.data ?? [], weekQuery.data?.entries ?? []),
    [developersQuery.data, weekQuery.data],
  )

  const projectSummaries = useMemo(
    () => buildProjectSummaries(projectsQuery.data ?? [], weekQuery.data?.entries ?? []),
    [projectsQuery.data, weekQuery.data],
  )

  const error = dayQuery.error ?? weekQuery.error ?? developersQuery.error ?? projectsQuery.error

  const datePicker = (
    <label className="dashboard__date">
      <span>Date</span>
      <input
        max={todayIsoDate()}
        onChange={(event) => setSelectedDate(event.target.value)}
        type="date"
        value={selectedDate}
      />
    </label>
  )

  if (error !== null) {
    return (
      <div className="dashboard">
        <Panel isPageHeading title="Dashboard">
          <ErrorState
            message={`The dashboard could not be loaded: ${error.message}`}
            onRetry={() => {
              void dayQuery.refetch()
              void weekQuery.refetch()
            }}
          />
        </Panel>
      </div>
    )
  }

  const day = dayQuery.data
  const week = weekQuery.data
  const isLoading = dayQuery.isPending || weekQuery.isPending

  return (
    <div className="dashboard">
      <Panel
        action={datePicker}
        description={`Team progress for ${formatLongDate(selectedDate)}. Mentor: ${MENTOR.name}.`}
        isPageHeading
        title="Dashboard"
      >
        {isLoading || day === undefined ? (
          <Skeleton label="Loading dashboard metrics…" rows={4} />
        ) : (
          <div className="stat-card-grid">
            <StatCard label="Tasks today" value={day.statuses.total} tone="progress" />
            <StatCard
              label="Completed"
              tone="positive"
              value={day.statuses.completed}
              detail={`${String(day.completionRate)}% completion rate`}
            />
            <StatCard label="In progress" value={day.statuses.inProgress} />
            <StatCard label="Not started" value={day.statuses.notStarted} />
            <StatCard
              label="Needs attention"
              tone={day.statuses.needsAttention > 0 ? 'attention' : 'neutral'}
              value={day.statuses.needsAttention}
              detail="Blocked by status or flag"
            />
            <StatCard label="Hours logged" value={day.hoursLogged} />
            <StatCard
              label="Updated today"
              tone="positive"
              value={day.developersUpdated.length}
              detail={`of ${String((developersQuery.data ?? []).filter((developer) => developer.active).length)} active`}
            />
            <StatCard
              label="Missing updates"
              tone={day.developersMissingUpdate.length > 0 ? 'attention' : 'positive'}
              value={day.developersMissingUpdate.length}
              detail={isWorkingDay(selectedDate) ? undefined : 'Not a working day'}
            />
          </div>
        )}
      </Panel>

      <div className="dashboard__row dashboard__row--priority">
        <Panel
          description="Raise these first: work that cannot move without help."
          title="Blocked work"
        >
          {isLoading || week === undefined ? (
            <Skeleton rows={2} />
          ) : (
            <EntryList
              emptyMessage="No blockers reported this week."
              entries={week.blockedEntries}
              limit={6}
              showDate
            />
          )}
        </Panel>

        <Panel
          description={
            isWorkingDay(selectedDate)
              ? 'Active developers with no entry for the selected day.'
              : 'The selected day is not a working day, so no updates are expected.'
          }
          title="Missing daily updates"
        >
          {isLoading || day === undefined ? (
            <Skeleton rows={2} />
          ) : day.developersMissingUpdate.length === 0 ? (
            <EmptyState message="Everyone has submitted an update." />
          ) : (
            <ul className="dashboard__missing">
              {day.developersMissingUpdate.map((developer) => (
                <li key={developer.id}>
                  <Link to={`/developers/${developer.id}`}>{developer.name}</Link>
                  {developer.role === undefined ? null : (
                    <span className="dashboard__missing-role">{developer.role}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        action={<Link to="/team-activity">View all activity</Link>}
        description={`Latest updates submitted on ${formatLongDate(selectedDate)}.`}
        title="Today's team activity"
      >
        {isLoading || day === undefined ? (
          <Skeleton rows={3} />
        ) : (
          <EntryList
            emptyMessage="No work updates found for the selected date."
            entries={day.entries}
            limit={8}
          />
        )}
      </Panel>

      <div className="dashboard__row">
        <Panel description="Updates, completions and blockers this week." title="Weekly task trend">
          {isLoading || week === undefined ? (
            <Skeleton rows={4} />
          ) : (
            <WeeklyTrendChart trend={week.trend} />
          )}
        </Panel>

        <Panel description="Status split across this week's entries." title="Task status">
          {isLoading || week === undefined ? (
            <Skeleton rows={4} />
          ) : (
            <StatusDistributionChart statuses={week.statuses} />
          )}
        </Panel>
      </div>

      <div className="dashboard__row">
        <Panel description="Stacked task status per developer." title="Developer-wise progress">
          {isLoading ? <Skeleton rows={4} /> : <DeveloperProgressChart summaries={developerSummaries} />}
        </Panel>

        <Panel description="Where this week's work is concentrated." title="Project distribution">
          {isLoading ? <Skeleton rows={4} /> : <ProjectDistributionChart summaries={projectSummaries} />}
        </Panel>
      </div>

      <Panel description="Hours logged each day this week." title="Weekly hours">
        {isLoading || week === undefined ? <Skeleton rows={3} /> : <HoursByDayChart trend={week.trend} />}
      </Panel>

      <Panel
        description={`Week of ${formatLongDate(weekRange.from)} to ${formatLongDate(weekRange.to)}.`}
        title="Developer summary"
      >
        {isLoading ? <Skeleton rows={4} /> : <DeveloperSummaryTable summaries={developerSummaries} />}
      </Panel>
    </div>
  )
}
