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
import { useAuth } from '@app/providers/auth-context'
import { useDayOverview, useDevelopers, useProjects, useRangeOverview } from '@hooks/use-work-tracker'
import { canViewTeamData } from '@services/auth/index'
import {
  formatLongDate,
  getWeekRange,
  isWorkingDay,
  toNearestWorkingDay,
  todayIsoDate,
} from '@utils/date.utils'
import { buildDeveloperSummaries, buildProjectSummaries } from '@utils/work-summary.utils'

import { AssignedWorkPanel } from '../components/AssignedWorkPanel'

import './DashboardPage.scss'

/**
 * The dashboard, which shows a different amount depending on the viewer.
 *
 * The numbers are already limited to what the person may see, because the
 * queries are scoped. What changes here is which panels are worth showing at
 * all: a developer looking at "missing updates" or "developer-wise progress"
 * would be reading a list of one, so those panels are for people who oversee
 * others.
 */
export function DashboardPage() {
  const { user } = useAuth()
  const isTeamView = canViewTeamData(user)

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
        description={
          isTeamView
            ? `Team progress for ${formatLongDate(selectedDate)}.`
            : `Your progress for ${formatLongDate(selectedDate)}.`
        }
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

            {/* Counts across people only mean something to someone who
                oversees more than themselves. */}
            {isTeamView ? (
              <>
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
              </>
            ) : (
              <StatCard
                label="Your update"
                tone={day.developersMissingUpdate.length === 0 ? 'positive' : 'attention'}
                value={day.developersMissingUpdate.length === 0 ? 'Submitted' : 'Not submitted'}
                detail={isWorkingDay(selectedDate) ? undefined : 'Not a working day'}
              />
            )}
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

        {isTeamView ? (
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
        ) : (
          <Panel description="Your most recent updates." title="Recent work">
            {isLoading || week === undefined ? (
              <Skeleton rows={3} />
            ) : (
              <EntryList
                emptyMessage="Nothing logged this week yet."
                entries={week.entries}
                limit={5}
                showDate
                showDeveloper={false}
              />
            )}
          </Panel>
        )}
      </div>

      {/* Assigned work is the one part of a developer's progress that is not
          derived from daily updates, so it needs its own read. Mentors and
          admins get the team panels above instead. */}
      {isTeamView ? null : <AssignedWorkPanel />}

      <Panel
        action={isTeamView ? <Link to="/team-activity">View all activity</Link> : undefined}
        description={`Latest updates submitted on ${formatLongDate(selectedDate)}.`}
        title={isTeamView ? "Today's team activity" : "Today's updates"}
      >
        {isLoading || day === undefined ? (
          <Skeleton rows={3} />
        ) : (
          <EntryList
            emptyMessage="No work updates found for the selected date."
            entries={day.entries}
            limit={8}
            showDeveloper={isTeamView}
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
        {isTeamView ? (
          <Panel description="Stacked task status per developer." title="Developer-wise progress">
            {isLoading ? <Skeleton rows={4} /> : <DeveloperProgressChart summaries={developerSummaries} />}
          </Panel>
        ) : null}

        <Panel description="Where this week's work is concentrated." title="Project distribution">
          {isLoading ? <Skeleton rows={4} /> : <ProjectDistributionChart summaries={projectSummaries} />}
        </Panel>
      </div>

      <Panel description="Hours logged each day this week." title="Weekly hours">
        {isLoading || week === undefined ? <Skeleton rows={3} /> : <HoursByDayChart trend={week.trend} />}
      </Panel>

      {isTeamView ? (
        <Panel
          description={`Week of ${formatLongDate(weekRange.from)} to ${formatLongDate(weekRange.to)}.`}
          title="Developer summary"
        >
          {isLoading ? <Skeleton rows={4} /> : <DeveloperSummaryTable summaries={developerSummaries} />}
        </Panel>
      ) : null}
    </div>
  )
}
