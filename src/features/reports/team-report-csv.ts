import type { ProjectStatus } from '@models/index'
import type { DateRange } from '@utils/date.utils'
import type { DeveloperSummary, ProjectSummary } from '@utils/work-summary.utils'

const PROJECT_STATUS_EXPORT_LABELS: Readonly<Record<ProjectStatus, string>> = {
  planned: 'Planned',
  active: 'Active',
  'on-hold': 'On hold',
  completed: 'Completed',
}

// Needs attention overlaps the status counts above it.
const STATUS_HEADER = [
  'Entries',
  'Not started',
  'In progress',
  'Completed',
  'Blocked',
  'Needs attention (overlaps)',
]

function statusCells(summary: DeveloperSummary | ProjectSummary): string[] {
  const { statuses } = summary

  return [
    String(statuses.total),
    String(statuses.notStarted),
    String(statuses.inProgress),
    String(statuses.completed),
    String(statuses.blocked),
    String(statuses.needsAttention),
  ]
}

export function buildDeveloperTotalsCsv(summaries: readonly DeveloperSummary[]): string[][] {
  const header = [
    'Developer',
    'Employee code',
    'Role',
    'Location',
    'On roster',
    ...STATUS_HEADER,
    'Completion rate (%)',
    'Hours logged',
    'Days logged',
  ]

  const rows = summaries.map((summary) => [
    summary.developer.name,
    summary.developer.code ?? '',
    summary.developer.role ?? '',
    summary.developer.location ?? '',
    summary.developer.active ? 'Active' : 'Inactive',
    ...statusCells(summary),
    String(summary.completionRate),
    String(summary.hoursLogged),
    String(summary.daysLogged),
  ])

  return [header, ...rows]
}

export function buildProjectTotalsCsv(summaries: readonly ProjectSummary[]): string[][] {
  const header = [
    'Project',
    'Project code',
    'Client',
    'Status',
    ...STATUS_HEADER,
    'Completion rate (%)',
    'Hours logged',
    'Contributors',
  ]

  const rows = summaries.map((summary) => [
    summary.project.name,
    summary.project.code ?? '',
    summary.project.client ?? '',
    PROJECT_STATUS_EXPORT_LABELS[summary.project.status],
    ...statusCells(summary),
    String(summary.completionRate),
    String(summary.hoursLogged),
    String(summary.contributorCount),
  ])

  return [header, ...rows]
}

export function buildTeamReportFilename(part: string, range: DateRange): string {
  return `team-report-${part}-${range.from}-to-${range.to}.csv`
}
