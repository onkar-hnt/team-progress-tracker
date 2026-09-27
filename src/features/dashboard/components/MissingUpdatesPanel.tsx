import { Link } from 'react-router-dom'

import { EmptyState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import type { DayOverview } from '@services/work-tracker.views'
import { isWorkingDay } from '@utils/date.utils'

/** Who has not accounted for the selected day. Leave is reported separately, not as a gap. */
export function MissingUpdatesPanel({
  day,
  isLoading,
  selectedDate,
}: {
  /** Undefined until the day has loaded. */
  day: DayOverview | undefined
  isLoading: boolean
  selectedDate: string
}) {
  return (
    <Panel
      action={<Link to="/missing-updates">See the days behind</Link>}
      description={
        isWorkingDay(selectedDate)
          ? 'Active developers with no entry for the selected day, leave aside.'
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

        {day === undefined || day.developersOnLeave.length === 0 ? null : (
          <p className="dashboard__missing-note">
            {day.developersOnLeave.length === 1
              ? `${day.developersOnLeave[0]?.name ?? ''} is on leave.`
              : `${String(day.developersOnLeave.length)} people are on leave.`}
          </p>
        )}
      </div>
    </Panel>
  )
}
