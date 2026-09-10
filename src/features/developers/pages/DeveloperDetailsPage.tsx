import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  HoursByDayChart,
  ProjectDistributionChart,
  StatusDistributionChart,
  WeeklyTrendChart,
} from '@components/charts/WorkCharts'
import { ProjectSummaryTable } from '@components/summaries/SummaryTables'
import { useAuth } from '@app/providers/auth-context'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { EntryList } from '@components/ui/entry-list/EntryList'
import { Panel } from '@components/ui/panel/Panel'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { CommentTimeline } from '@features/feedback/components/CommentTimeline'
import { TaskTable } from '@features/tasks/components/TaskTable'
import { useAccessScope } from '@hooks/use-access-scope'
import {
  useComments,
  useDailyWorkEntries,
  useDevelopers,
  useProjects,
  useTasks,
} from '@hooks/use-work-tracker'
import { canViewDeveloperProfile, canViewTeamData } from '@services/auth/index'
import {
  formatLongDate,
  getMonthRange,
  getTrailingRange,
  getWeekRange,
  listWorkingDatesInRange,
  todayIsoDate,
} from '@utils/date.utils'
import {
  buildDailyTrend,
  buildProjectSummaries,
  calculateCompletionRate,
  findBlockedEntries,
  sumHoursLogged,
  summariseStatuses,
} from '@utils/work-summary.utils'

import './DeveloperDetailsPage.scss'

const PERIODS = {
  'this-week': { label: 'This week', resolve: getWeekRange },
  'this-month': { label: 'This month', resolve: getMonthRange },
  'last-14-days': { label: 'Last 14 days', resolve: (date: string) => getTrailingRange(date, 14) },
} as const

type PeriodKey = keyof typeof PERIODS

export function DeveloperDetailsPage() {
  const { developerId = '' } = useParams<{ developerId: string }>()
  const { user } = useAuth()
  const { scope } = useAccessScope()
  const [periodKey, setPeriodKey] = useState<PeriodKey>('this-week')

  // The id arrives from the URL, so this is the point where somebody could
  // try to open a colleague's page by editing the address bar. The check runs
  // before any query is issued, and the wording is the same whether or not
  // the person exists, so a refusal does not confirm who is on the team.
  const isPermitted = canViewDeveloperProfile(scope, developerId)

  // Memoised so the derived trend is not rebuilt on every unrelated render.
  const range = useMemo(() => PERIODS[periodKey].resolve(todayIsoDate()), [periodKey])

  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()
  const query = useMemo(
    () => ({ developerIds: [developerId], dateFrom: range.from, dateTo: range.to }),
    [developerId, range.from, range.to],
  )
  const entriesQuery = useDailyWorkEntries(query)
  const developerFilter = useMemo(() => ({ developerIds: [developerId] }), [developerId])
  const tasksQuery = useTasks(developerFilter)
  const commentsQuery = useComments(developerFilter)

  const entries = useMemo(() => entriesQuery.data ?? [], [entriesQuery.data])

  const projectSummaries = useMemo(
    () => buildProjectSummaries(projectsQuery.data ?? [], entries),
    [entries, projectsQuery.data],
  )

  const statuses = useMemo(() => summariseStatuses(entries), [entries])
  const trend = useMemo(() => buildDailyTrend(entries, range), [entries, range])

  const developer = developersQuery.data?.find((candidate) => candidate.id === developerId)
  const error = developersQuery.error ?? entriesQuery.error ?? projectsQuery.error
  const isLoading = developersQuery.isPending || entriesQuery.isPending

  const periodPicker = (
    <label className="developer-details__period">
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

  if (!isPermitted) {
    return (
      <PagePlaceholder
        description="You do not have access to this person's progress. Your own is on the dashboard."
        title="Not available"
      />
    )
  }

  if (error !== null) {
    return (
      <div className="developer-details">
        <Panel isPageHeading title="Developer">
          <ErrorState
            message={`This developer could not be loaded: ${error.message}`}
            onRetry={() => void entriesQuery.refetch()}
          />
        </Panel>
      </div>
    )
  }

  if (!isLoading && developer === undefined) {
    return (
      <div className="developer-details">
        <Panel isPageHeading title="Developer not found">
          <EmptyState message={`No developer exists with the id ${developerId}.`} />
          {canViewTeamData(user) ? (
            <p className="developer-details__back">
              <Link to="/developers">Back to all developers</Link>
            </p>
          ) : null}
        </Panel>
      </div>
    )
  }

  // Update consistency compares days logged against working days in the
  // period, which is the same rule the dashboard uses for missing updates.
  const workingDays = listWorkingDatesInRange(range).length
  const daysLogged = new Set(entries.map((entry) => entry.date)).size

  return (
    <div className="developer-details">
      <Panel
        action={periodPicker}
        description={
          developer === undefined
            ? undefined
            : `${developer.role ?? 'Developer'}${developer.location === undefined ? '' : ` · ${developer.location}`} · ${formatLongDate(range.from)} to ${formatLongDate(range.to)}`
        }
        isPageHeading
        title={developer?.name ?? 'Developer'}
      >
        {isLoading ? (
          <Skeleton label="Loading developer metrics…" rows={4} />
        ) : (
          <div className="stat-card-grid">
            <StatCard label="Tasks" value={statuses.total} tone="progress" />
            <StatCard label="Completed" tone="positive" value={statuses.completed} />
            <StatCard label="In progress" value={statuses.inProgress} />
            <StatCard label="Not started" value={statuses.notStarted} />
            <StatCard
              label="Needs attention"
              tone={statuses.needsAttention > 0 ? 'attention' : 'neutral'}
              value={statuses.needsAttention}
            />
            <StatCard
              label="Completion rate"
              value={`${String(calculateCompletionRate(entries))}%`}
            />
            <StatCard label="Hours logged" value={sumHoursLogged(entries)} />
            <StatCard
              label="Days updated"
              tone={daysLogged < workingDays ? 'attention' : 'positive'}
              value={daysLogged}
              detail={`of ${String(workingDays)} working days`}
            />
          </div>
        )}
      </Panel>

      <div className="developer-details__row">
        <Panel description="Task updates, completions and blockers." title="Activity trend">
          {isLoading ? <Skeleton rows={4} /> : <WeeklyTrendChart trend={trend} />}
        </Panel>

        <Panel description="How this period's work is split." title="Task status">
          {isLoading ? <Skeleton rows={4} /> : <StatusDistributionChart statuses={statuses} />}
        </Panel>
      </div>

      <div className="developer-details__row">
        <Panel description="Hours logged per day." title="Hours">
          {isLoading ? <Skeleton rows={3} /> : <HoursByDayChart trend={trend} />}
        </Panel>

        <Panel description="Projects worked on in this period." title="Project split">
          {isLoading ? <Skeleton rows={3} /> : <ProjectDistributionChart summaries={projectSummaries} />}
        </Panel>
      </div>

      <Panel description="Work that cannot progress without help." title="Current blockers">
        {isLoading ? (
          <Skeleton rows={2} />
        ) : (
          <EntryList
            emptyMessage="No blockers reported in this period."
            entries={findBlockedEntries(entries)}
            showDate
            showDeveloper={false}
          />
        )}
      </Panel>

      <Panel
        action={
          canViewTeamData(user) ? <Link to="/team-activity">Open in team activity</Link> : undefined
        }
        description="Newest first."
        title="Task history"
      >
        {isLoading ? (
          <Skeleton rows={5} />
        ) : (
          <EntryList
            emptyMessage="No work has been logged in this period."
            entries={entries}
            limit={20}
            showDate
            showDeveloper={false}
          />
        )}
      </Panel>

      <Panel description="Totals per project for this developer." title="Project breakdown">
        {isLoading ? <Skeleton rows={3} /> : <ProjectSummaryTable summaries={projectSummaries} />}
      </Panel>

      <Panel description="Work assigned to this developer." title="Assigned tasks">
        {tasksQuery.isPending ? (
          <Skeleton rows={3} />
        ) : (
          <TaskTable
            emptyMessage="No tasks are assigned."
            showDeveloper={false}
            tasks={tasksQuery.data ?? []}
          />
        )}
      </Panel>

      <Panel description="Feedback recorded by mentors." title="Mentor feedback">
        {commentsQuery.isPending ? (
          <Skeleton rows={3} />
        ) : (
          <CommentTimeline
            comments={commentsQuery.data ?? []}
            emptyMessage="No feedback has been recorded yet."
            showDeveloper={false}
          />
        )}
      </Panel>
    </div>
  )
}
