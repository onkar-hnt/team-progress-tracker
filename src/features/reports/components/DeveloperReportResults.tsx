import { Button } from '@components/ui/button/Button'
import { EmptyState } from '@components/ui/feedback/Feedback'
import { PriorityBadge, StatusBadge } from '@components/ui/status-badge/StatusBadge'
import { StatCard } from '@components/ui/stat-card/StatCard'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { formatShortDate } from '@utils/date.utils'

import type { DeveloperReportSummary } from '../hooks/use-developer-report'

interface DeveloperReportResultsProps {
  entries: readonly DailyWorkEntryView[]
  summary: DeveloperReportSummary
  onDownload: () => void
}

/**
 * The generated report: what it adds up to, then every row behind it.
 *
 * The preview is narrower than the download on purpose. Thirteen columns of
 * free text is a file, not a table — so the columns worth scanning are on screen
 * and the rest are in the CSV, which is where somebody reads a full remark.
 */
export function DeveloperReportResults({
  entries,
  onDownload,
  summary,
}: DeveloperReportResultsProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        message="No work was logged for this developer against these filters. Try widening the date range, or choosing All projects."
        title="Nothing to report"
        variant="filtered"
      />
    )
  }

  return (
    <div className="developer-report__results">
      <div className="stat-card-grid">
        <StatCard
          detail={`across ${String(summary.daysCovered)} ${summary.daysCovered === 1 ? 'day' : 'days'}`}
          icon="calendar"
          label="Updates"
          tone="progress"
          value={summary.updateCount}
        />
        <StatCard icon="tasks" label="Tasks worked on" value={summary.tasksWorkedOn} />
        <StatCard
          detail={`${String(summary.completionRate)}% of updates`}
          icon="activity"
          label="Completed"
          tone="positive"
          value={summary.statuses.completed}
        />
        <StatCard icon="chart" label="In progress" value={summary.statuses.inProgress} />
        <StatCard icon="calendar" label="Hours logged" value={summary.hoursLogged} />
        <StatCard
          icon="alert"
          label="Blockers raised"
          tone={summary.blockedCount > 0 ? 'attention' : 'neutral'}
          value={summary.blockedCount}
        />
      </div>

      <div className="developer-report__table-header">
        <p className="developer-report__count">
          {summary.updateCount} {summary.updateCount === 1 ? 'record' : 'records'}
        </p>

        <Button icon="download" onClick={onDownload} variant="secondary">
          Download CSV
        </Button>
      </div>

      <div className="data-table__scroll">
        <table className="data-table">
          <caption>Every update logged in the selected period, newest first.</caption>
          <thead>
            <tr>
              <th className="data-table__nowrap" scope="col">
                Date
              </th>
              <th scope="col">Project</th>
              <th scope="col">Task</th>
              <th scope="col">Status</th>
              <th scope="col">Priority</th>
              <th className="data-table__numeric" scope="col">
                Progress
              </th>
              <th className="data-table__numeric" scope="col">
                Hours
              </th>
              <th scope="col">Work done</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="data-table__nowrap">{formatShortDate(entry.date)}</td>
                <td>{entry.projectName}</td>
                <td>{entry.taskTitle}</td>
                <td>
                  <StatusBadge status={entry.status} />
                </td>
                <td>
                  <PriorityBadge priority={entry.priority} />
                </td>
                <td className="data-table__numeric">{entry.progress}%</td>
                <td className="data-table__numeric">{entry.hoursSpent ?? '—'}</td>
                <td>{entry.workDone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
