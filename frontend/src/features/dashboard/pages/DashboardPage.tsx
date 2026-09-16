import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  DeveloperProgressChart,
  HoursByDayChart,
  ProjectDistributionChart,
  StatusDistributionChart,
  WeeklyTrendChart,
} from '@components/charts/WorkCharts'
import { DeveloperSummaryTable } from '@components/summaries/SummaryTables'
import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { FilterField } from '@components/ui/field/Field'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { EntryList } from '@components/ui/entry-list/EntryList'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { DailyUpdateForm } from '@features/daily-update/components/DailyUpdateForm'
import type { ActivitySlice } from '@features/team-activity/activity-filters'
import { activityLink, activityRangeLink } from '@features/team-activity/activity-filters'
import { TASK_STATUS_LABELS, TASK_STATUS_OPTIONS } from '@constants/task.constants'
import {
  useDayOverview,
  useDevelopers,
  useProjects,
  useRangeOverview,
  useUpdateDailyWorkEntry,
} from '@hooks/use-work-tracker'
import type { TaskStatus } from '@models/index'
import { canEditEntry, canViewTeamData } from '@services/auth/index'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { progressForStatus } from '@utils/task.utils'
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

export function DashboardPage() {
  const { user } = useAuth()
  const snackbar = useSnackbar()
  const navigate = useNavigate()
  const isTeamView = canViewTeamData(user)

  const [selectedDate, setSelectedDate] = useState(() => toNearestWorkingDay(todayIsoDate()))

  const [editing, setEditing] = useState<DailyWorkEntryView | null>(null)

  const updateEntry = useUpdateDailyWorkEntry()
  const savingEntryId = updateEntry.isPending ? (updateEntry.variables?.id ?? null) : null

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

  const openActivity = isTeamView
    ? (slice: ActivitySlice) => {
        void navigate(activityRangeLink(weekRange, slice))
      }
    : undefined

  const renderEntryActions = (entry: DailyWorkEntryView) =>
    canEditEntry(user, entry) ? (
      <>
        <EntryStatusSelect
          entry={entry}
          isSaving={savingEntryId === entry.id}
          onChange={(status) => {
            const progress = progressForStatus(status)

            updateEntry.mutate(
              {
                id: entry.id,
                changes: progress === null ? { status } : { status, progress },
              },
              {
                onSuccess: () => {
                  snackbar.success(`The update is now ${TASK_STATUS_LABELS[status]}.`)
                },
              },
            )
          }}
        />

        <Button onClick={() => setEditing(entry)} size="small" variant="ghost">
          Edit
        </Button>
      </>
    ) : null

  const entryActions = isTeamView ? undefined : renderEntryActions

  const datePicker = (
    <FilterField isInline label="Date">
      <input
        max={todayIsoDate()}
        onChange={(event) => setSelectedDate(event.target.value)}
        type="date"
        value={selectedDate}
      />
    </FilterField>
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

  // Exclude inactive developers from the "Updated today" denominator.
  const activeDeveloperCount = (developersQuery.data ?? []).filter(
    (developer) => developer.active,
  ).length

  return (
    <div className="dashboard">
      <Panel
        action={datePicker}
        description={
          isTeamView
            ? `Daily updates submitted on ${formatLongDate(selectedDate)}. Assigned tasks are counted separately on the Tasks screen.`
            : `Your daily updates for ${formatLongDate(selectedDate)}. Your assigned tasks are counted separately on My Tasks.`
        }
        isPageHeading
        title="Dashboard"
      >
        {isLoading || day === undefined ? (
          <Skeleton label="Loading dashboard metrics…" rows={4} />
        ) : (
          <div className="stat-card-grid">
            <StatCard
              icon="calendar"
              label="Updates today"
              to={isTeamView ? activityLink(selectedDate) : '/daily-update'}
              tone="progress"
              value={day.statuses.total}
            />
            <StatCard
              detail={`${String(day.completionRate)}% of today's updates`}
              icon="check"
              label="Completed"
              progress={day.completionRate}
              to={isTeamView ? activityLink(selectedDate, { status: 'completed' }) : undefined}
              tone="positive"
              value={day.statuses.completed}
            />
            <StatCard
              icon="activity"
              label="In progress"
              to={isTeamView ? activityLink(selectedDate, { status: 'in-progress' }) : undefined}
              value={day.statuses.inProgress}
            />
            <StatCard
              icon="tasks"
              label="Not started"
              to={isTeamView ? activityLink(selectedDate, { status: 'not-started' }) : undefined}
              value={day.statuses.notStarted}
            />
            <StatCard
              detail="Blocked by status or flag"
              icon="alert"
              label="Needs attention"
              to={isTeamView ? activityLink(selectedDate, { blockedOnly: true }) : undefined}
              tone={day.statuses.needsAttention > 0 ? 'attention' : 'neutral'}
              value={day.statuses.needsAttention}
            />
            <StatCard icon="chart" label="Hours logged" value={day.hoursLogged} />

            {isTeamView ? (
              <>
                <StatCard
                  detail={`of ${String(activeDeveloperCount)} active`}
                  icon="users"
                  label="Updated today"
                  progress={
                    activeDeveloperCount === 0
                      ? 0
                      : (day.developersUpdated.length / activeDeveloperCount) * 100
                  }
                  to={activityLink(selectedDate)}
                  tone="positive"
                  value={day.developersUpdated.length}
                />
                <StatCard
                  detail={isWorkingDay(selectedDate) ? undefined : 'Not a working day'}
                  icon="alert"
                  label="Missing updates"
                  tone={day.developersMissingUpdate.length > 0 ? 'attention' : 'positive'}
                  value={day.developersMissingUpdate.length}
                />
              </>
            ) : (
              <StatCard
                detail={isWorkingDay(selectedDate) ? undefined : 'Not a working day'}
                icon="calendar"
                label="Your update"
                to="/daily-update"
                tone={day.developersMissingUpdate.length === 0 ? 'positive' : 'attention'}
                value={day.developersMissingUpdate.length === 0 ? 'Submitted' : 'Not submitted'}
              />
            )}
          </div>
        )}
      </Panel>

      <div className="dashboard__row dashboard__row--priority">
        {isTeamView ? null : (
          <Panel description="Your most recent updates." title="Recent work">
            <div className="dashboard__panel-scroll">
              {isLoading || week === undefined ? (
                <Skeleton rows={3} />
              ) : (
                <EntryList
                  emptyMessage="Nothing logged this week yet."
                  entries={week.entries}
                  limit={5}
                  renderActions={entryActions}
                  showDate
                  showDeveloper={false}
                />
              )}
            </div>
          </Panel>
        )}

        <Panel
          description="Raise these first: work that cannot move without help."
          title="Blocked work"
        >
          <div className="dashboard__panel-scroll">
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
          </div>
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
            <div className="dashboard__panel-scroll">
              {isLoading || day === undefined ? (
                <Skeleton rows={2} />
              ) : day.developersMissingUpdate.length === 0 ? (
                <EmptyState
                  icon="check"
                  message="Everyone active has logged their work for this day."
                  title="Nothing outstanding"
                />
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
            </div>
          </Panel>
        ) : null}
      </div>

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
            renderActions={entryActions}
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
            <StatusDistributionChart
              onSelectStatus={
                openActivity === undefined
                  ? undefined
                  : (status) => {
                      openActivity({ status })
                    }
              }
              statuses={week.statuses}
            />
          )}
        </Panel>
      </div>

      <div className="dashboard__row">
        {isTeamView ? (
          <Panel description="Stacked task status per developer." title="Developer-wise progress">
            {isLoading ? (
              <Skeleton rows={4} />
            ) : (
              <DeveloperProgressChart
                onSelectDeveloper={
                  openActivity === undefined
                    ? undefined
                    : (developerId) => {
                        openActivity({ developerId })
                      }
                }
                summaries={developerSummaries}
              />
            )}
          </Panel>
        ) : null}

        <Panel description="Where this week's work is concentrated." title="Project distribution">
          {isLoading ? (
            <Skeleton rows={4} />
          ) : (
            <ProjectDistributionChart
              onSelectProject={
                openActivity === undefined
                  ? undefined
                  : (projectId) => {
                      openActivity({ projectId })
                    }
              }
              summaries={projectSummaries}
            />
          )}
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

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit update">
        {editing === null ? null : (
          <DailyUpdateForm date={editing.date} entry={editing} onSaved={() => setEditing(null)} />
        )}
      </Modal>
    </div>
  )
}

function EntryStatusSelect({
  entry,
  isSaving,
  onChange,
}: {
  entry: DailyWorkEntryView
  isSaving: boolean
  onChange: (status: TaskStatus) => void
}) {
  return (
    <div className="dashboard__entry-status">
      <Dropdown
        ariaLabel={`Status for ${entry.taskTitle}`}
        disabled={isSaving}
        isCompact
        onChange={(next) => {
          if (next !== entry.status) onChange(next as TaskStatus)
        }}
        options={TASK_STATUS_OPTIONS}
        value={entry.status}
      />

      {isSaving ? (
        <span className="dashboard__entry-saving" role="status">
          Saving…
        </span>
      ) : null}
    </div>
  )
}
