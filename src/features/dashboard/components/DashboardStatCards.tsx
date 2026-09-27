import { StatCard } from '@components/ui/stat-card/StatCard'
import { activityLink } from '@features/team-activity/activity-filters'
import type { DayOverview } from '@services/work-tracker.views'
import { isWorkingDay } from '@utils/date.utils'

/**
 * The day's totals across the top of the dashboard.
 *
 * Only a team view can follow a card through to the activity screen, so the
 * personal view passes no destination rather than linking somewhere that would
 * refuse to show anything.
 */
export function DashboardStatCards({
  activeDeveloperCount,
  day,
  isTeamView,
  selectedDate,
}: {
  /** The denominator for "Updated today"; excludes inactive developers. */
  activeDeveloperCount: number
  day: DayOverview
  isTeamView: boolean
  selectedDate: string
}) {
  return (
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
            to="/missing-updates"
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
  )
}
