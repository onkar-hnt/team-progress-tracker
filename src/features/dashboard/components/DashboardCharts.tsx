import {
  DeveloperProgressChart,
  HoursByDayChart,
  ProjectDistributionChart,
  StatusDistributionChart,
  WeeklyTrendChart,
} from '@components/charts/WorkCharts'
import { DeveloperSummaryTable } from '@components/summaries/SummaryTables'
import { Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import type { ActivitySlice } from '@features/team-activity/utils/activity-filters'
import type { RangeOverview } from '@services/work-tracker.views'
import type { DateRange } from '@utils/date.utils'
import { formatLongDate } from '@utils/date.utils'
import type { DeveloperSummary, ProjectSummary } from '@utils/work-summary.utils'

/**
 * The week's charts, below the fold.
 *
 * `onSelectSlice` is undefined for somebody who can only see their own work:
 * the charts then read as charts rather than as links into a team screen that
 * would show them nothing.
 */
export function DashboardCharts({
  developerSummaries,
  isLoading,
  isTeamView,
  onSelectSlice,
  projectSummaries,
  week,
  weekRange,
}: {
  developerSummaries: readonly DeveloperSummary[]
  isLoading: boolean
  isTeamView: boolean
  onSelectSlice?: ((slice: ActivitySlice) => void) | undefined
  projectSummaries: readonly ProjectSummary[]
  week: RangeOverview | undefined
  weekRange: DateRange
}) {
  return (
    <>
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
                onSelectSlice === undefined
                  ? undefined
                  : (status) => {
                      onSelectSlice({ status })
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
                  onSelectSlice === undefined
                    ? undefined
                    : (developerId) => {
                        onSelectSlice({ developerId })
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
                onSelectSlice === undefined
                  ? undefined
                  : (projectId) => {
                      onSelectSlice({ projectId })
                    }
              }
              summaries={projectSummaries}
            />
          )}
        </Panel>
      </div>

      <Panel description="Hours logged each day this week." title="Weekly hours">
        {isLoading || week === undefined ? (
          <Skeleton rows={3} />
        ) : (
          <HoursByDayChart trend={week.trend} />
        )}
      </Panel>

      {isTeamView ? (
        <Panel
          description={`Week of ${formatLongDate(weekRange.from)} to ${formatLongDate(weekRange.to)}.`}
          title="Developer summary"
        >
          {isLoading ? (
            <Skeleton rows={4} />
          ) : (
            <DeveloperSummaryTable summaries={developerSummaries} />
          )}
        </Panel>
      ) : null}
    </>
  )
}
