import { Link } from 'react-router-dom'

import { EmptyState } from '@components/ui/feedback/Feedback'
import type { DeveloperSummary, ProjectSummary } from '@utils/work-summary.utils'

/**
 * Tabular summaries used by both the dashboard and the reports screen.
 *
 * Developers and projects with no activity in the period are dropped, since a
 * row of zeroes crowds out the rows that matter. The caller states the period
 * in the surrounding panel.
 */

interface DeveloperSummaryTableProps {
  summaries: readonly DeveloperSummary[]
  caption?: string
}

export function DeveloperSummaryTable({ caption, summaries }: DeveloperSummaryTableProps) {
  const active = summaries.filter((summary) => summary.statuses.total > 0)

  if (active.length === 0) {
    return <EmptyState message="No developer activity is available for this period." />
  }

  return (
    <div className="data-table__scroll">
      <table className="data-table">
        {caption === undefined ? null : <caption>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">Developer</th>
            <th className="data-table__numeric" scope="col">
              Tasks
            </th>
            <th className="data-table__numeric" scope="col">
              Done
            </th>
            <th className="data-table__numeric" scope="col">
              Active
            </th>
            <th className="data-table__numeric" scope="col">
              Pending
            </th>
            <th className="data-table__numeric" scope="col">
              Blocked
            </th>
            <th className="data-table__numeric" scope="col">
              Rate
            </th>
            <th className="data-table__numeric" scope="col">
              Hours
            </th>
            <th className="data-table__numeric" scope="col">
              Days
            </th>
          </tr>
        </thead>
        <tbody>
          {active.map((summary) => (
            <tr key={summary.developer.id}>
              <td>
                <Link to={`/developers/${summary.developer.id}`}>{summary.developer.name}</Link>
              </td>
              <td className="data-table__numeric">{summary.statuses.total}</td>
              <td className="data-table__numeric">{summary.statuses.completed}</td>
              <td className="data-table__numeric">{summary.statuses.inProgress}</td>
              <td className="data-table__numeric">{summary.statuses.notStarted}</td>
              <td className="data-table__numeric">{summary.statuses.needsAttention}</td>
              <td className="data-table__numeric">{summary.completionRate}%</td>
              <td className="data-table__numeric">{summary.hoursLogged}</td>
              <td className="data-table__numeric">{summary.daysLogged}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ProjectSummaryTableProps {
  summaries: readonly ProjectSummary[]
  caption?: string
}

export function ProjectSummaryTable({ caption, summaries }: ProjectSummaryTableProps) {
  const active = summaries.filter((summary) => summary.statuses.total > 0)

  if (active.length === 0) {
    return <EmptyState message="No project activity is available for this period." />
  }

  return (
    <div className="data-table__scroll">
      <table className="data-table">
        {caption === undefined ? null : <caption>{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Client</th>
            <th className="data-table__numeric" scope="col">
              Tasks
            </th>
            <th className="data-table__numeric" scope="col">
              Done
            </th>
            <th className="data-table__numeric" scope="col">
              Blocked
            </th>
            <th className="data-table__numeric" scope="col">
              Rate
            </th>
            <th className="data-table__numeric" scope="col">
              Hours
            </th>
            <th className="data-table__numeric" scope="col">
              People
            </th>
          </tr>
        </thead>
        <tbody>
          {active.map((summary) => (
            <tr key={summary.project.id}>
              <td>{summary.project.name}</td>
              <td>{summary.project.client ?? '—'}</td>
              <td className="data-table__numeric">{summary.statuses.total}</td>
              <td className="data-table__numeric">{summary.statuses.completed}</td>
              <td className="data-table__numeric">{summary.statuses.needsAttention}</td>
              <td className="data-table__numeric">{summary.completionRate}%</td>
              <td className="data-table__numeric">{summary.hoursLogged}</td>
              <td className="data-table__numeric">{summary.contributorCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
