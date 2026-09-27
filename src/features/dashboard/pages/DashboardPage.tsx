import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '@components/ui/button/Button'
import { FilterField } from '@components/ui/field/Field'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { EntryList } from '@components/ui/entry-list/EntryList'
import { Panel } from '@components/ui/panel/Panel'
import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { AssignedMentorNames } from '@features/profile/components/AssignedMentors'
import type { ActivitySlice } from '@features/team-activity/utils/activity-filters'
import { activityRangeLink } from '@features/team-activity/utils/activity-filters'
import { TASK_STATUS_LABELS } from '@constants/task.constants'
import {
  useDayOverview,
  useDevelopers,
  useProjects,
  useRangeOverview,
  useUpdateDailyWorkEntry,
} from '@hooks/use-work-tracker'
import { canEditEntry, canViewTeamData } from '@services/auth/index'
import type { DailyWorkEntryView } from '@services/work-tracker.views'
import { progressForStatus } from '@utils/task.utils'
import {
  formatLongDate,
  getWeekRange,
  toNearestWorkingDay,
  todayIsoDate,
} from '@utils/date.utils'
import { buildDeveloperSummaries, buildProjectSummaries } from '@utils/work-summary.utils'

import { AssignedWorkPanel } from '../components/AssignedWorkPanel'
import { DashboardCharts } from '../components/DashboardCharts'
import { DashboardStatCards } from '../components/DashboardStatCards'
import { EditUpdateModal } from '../components/EditUpdateModal'
import { EntryStatusSelect } from '../components/EntryStatusSelect'
import { MissingUpdatesPanel } from '../components/MissingUpdatesPanel'

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
          <>
            {isTeamView || user?.developerId === undefined ? null : (
              <p className="dashboard__mentors">
                Mentors: <AssignedMentorNames title={`Mentors assigned to ${user.name}`} />
              </p>
            )}

            <DashboardStatCards
              activeDeveloperCount={activeDeveloperCount}
              day={day}
              isTeamView={isTeamView}
              selectedDate={selectedDate}
            />
          </>
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
          <MissingUpdatesPanel day={day} isLoading={isLoading} selectedDate={selectedDate} />
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

      <DashboardCharts
        developerSummaries={developerSummaries}
        isLoading={isLoading}
        isTeamView={isTeamView}
        onSelectSlice={openActivity}
        projectSummaries={projectSummaries}
        week={week}
        weekRange={weekRange}
      />

      <EditUpdateModal
        entry={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing(null)}
      />
    </div>
  )
}
