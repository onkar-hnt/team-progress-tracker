import type { ProjectStatus } from '@models/index'
import type { DateRange } from '@utils/date.utils'
import type { DeveloperSummary, ProjectSummary } from '@utils/work-summary.utils'

/**
 * The team report, as files.
 *
 * Until now only the per-developer report could be downloaded, so anybody who
 * wanted the team's figures in a spreadsheet — which is what a monthly review
 * actually runs on — retyped them off the screen or asked for them one developer
 * at a time.
 *
 * Three files rather than one, because they are three different shapes: a row per
 * developer, a row per project, and a row per entry. Putting them in one file
 * would mean either three header rows in a single sheet, which no spreadsheet
 * imports cleanly, or a zip, which is a dependency and a second thing to explain.
 *
 * Every file is built from what the screen is already showing. Nothing is fetched
 * for a download, so a file cannot disagree with the panel it came from, and the
 * period in the filename is the period in the heading.
 */

/**
 * Written out rather than exported raw.
 *
 * `on-hold` is a stored value, not a word: a file read by somebody who has never
 * seen this application should say "On hold".
 */
const PROJECT_STATUS_EXPORT_LABELS: Readonly<Record<ProjectStatus, string>> = {
  planned: 'Planned',
  active: 'Active',
  'on-hold': 'On hold',
  completed: 'Completed',
}

/**
 * The status counts, in the order the panels show them.
 *
 * `needsAttention` overlaps the four before it — an entry blocked by flag rather
 * than by status is counted in both — so the header says so. In a spreadsheet the
 * four will be summed by somebody, and this is the only place to warn them.
 */
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

/** A row per developer: who logged what, over the period on screen. */
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
    // Inactive people are exported rather than dropped. A row of zeroes for
    // somebody who left mid-period is information; their absence from the file is
    // a gap the reader has to notice.
    summary.developer.active ? 'Active' : 'Inactive',
    ...statusCells(summary),
    String(summary.completionRate),
    String(summary.hoursLogged),
    String(summary.daysLogged),
  ])

  return [header, ...rows]
}

/** A row per project: where the period's effort went. */
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

/**
 * `team-report-developers-2026-09-01-to-2026-09-30.csv`
 *
 * ISO dates, so a folder of these sorts chronologically — which is not true of the
 * format the heading shows. The same convention as the per-developer report, so
 * the two sit together in a downloads folder.
 */
export function buildTeamReportFilename(part: string, range: DateRange): string {
  return `team-report-${part}-${range.from}-to-${range.to}.csv`
}
