import { useMemo } from 'react'

import { useDailyWorkEntries } from '@hooks/use-work-tracker'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { getStatusLabel, getPriorityLabel } from '@utils/task.utils'
import { toFilenameSlug } from '@utils/csv.utils'
import { formatLongDate } from '@utils/date.utils'
import type { StatusBreakdown } from '@utils/work-summary.utils'
import { calculateCompletionRate, sumHoursLogged, summariseStatuses } from '@utils/work-summary.utils'

/**
 * The data behind one developer's activity report.
 *
 * ## Where the authorization is
 *
 * Not here. `useDailyWorkEntries` reaches `list_daily_updates`, which is
 * `security invoker`, so the `daily_updates_select` policy runs as the signed-in
 * mentor and admits only rows where `can_view_developer(developer_id)` is true —
 * that is, rows for a developer with an active `mentor_assignments` row naming
 * them. A developer id typed into the URL, edited in the devtools or replayed
 * from another session returns nothing, because the filter is a hint to the
 * database and the policy is the decision.
 *
 * `WorkTrackerService` then re-applies the access scope over whatever came back,
 * and the picker only offers developers already in scope. Three layers, and the
 * one that matters is the one the browser cannot reach.
 *
 * ## Why the summary is built from daily updates alone
 *
 * A mentor asking for "tasks in September" means work that happened in
 * September, and `tasks` records no such thing — it has a created date and a due
 * date, neither of which is when the work was done. `daily_updates` is the dated
 * record, so every figure below is derived from it and labelled as such. Adding
 * a task count over a date range would have meant inventing a semantics for it.
 */

export interface DeveloperReportFilters {
  developerId: string

  /** Empty means every project. */
  projectId: string

  /** Inclusive, both ends. */
  from: string
  to: string
}

export interface DeveloperReportSummary {
  statuses: StatusBreakdown

  /** One per daily update filed in the range. */
  updateCount: number

  /** Distinct pieces of work touched, rather than updates about them. */
  tasksWorkedOn: number

  /** Distinct calendar days with at least one update. */
  daysCovered: number

  hoursLogged: number
  completionRate: number
  blockedCount: number
}

interface DeveloperReport {
  entries: readonly DailyWorkEntryView[]
  summary: DeveloperReportSummary
  isPending: boolean
  error: Error | null
}

/**
 * A query that the data layer answers with an empty list and no request.
 *
 * `matchesNothing` in the repositories short-circuits an empty id list, and the
 * in-memory providers reach the same answer through `[].includes`. So this is how
 * the report stays unfetched until somebody presses Generate, without making the
 * hook conditional.
 */
const NOTHING_REQUESTED = { developerIds: [] } as const

export function useDeveloperReport(filters: DeveloperReportFilters | null): DeveloperReport {
  const query = useDailyWorkEntries(
    filters === null
      ? NOTHING_REQUESTED
      : {
          dateFrom: filters.from,
          dateTo: filters.to,
          developerIds: [filters.developerId],
          ...(filters.projectId === '' ? {} : { projectIds: [filters.projectId] }),
        },
  )

  const entries = useMemo(() => query.data ?? [], [query.data])

  const summary = useMemo<DeveloperReportSummary>(
    () => ({
      statuses: summariseStatuses(entries),
      updateCount: entries.length,
      tasksWorkedOn: new Set(entries.map((entry) => entry.taskId ?? entry.taskTitle)).size,
      daysCovered: new Set(entries.map((entry) => entry.date)).size,
      hoursLogged: sumHoursLogged(entries),
      completionRate: calculateCompletionRate(entries),
      blockedCount: entries.filter((entry) => entry.isBlocked).length,
    }),
    [entries],
  )

  return {
    entries,
    summary,
    // A report nobody has asked for is not loading. Without this the panel would
    // show a skeleton before the first Generate.
    isPending: filters !== null && query.isPending,
    error: query.error,
  }
}

/**
 * The rows of the downloaded file.
 *
 * Every column is a field that exists on the record. The narrow ones come first
 * so the file is readable without scrolling, and the long free-text ones last.
 * Numbers are written plainly rather than formatted, because the destination is
 * a spreadsheet that will want to sum them.
 */
export function buildDeveloperReportCsv(entries: readonly DailyWorkEntryView[]): string[][] {
  const header = [
    'Date',
    'Developer',
    'Project',
    'Task',
    'Status',
    'Priority',
    'Progress (%)',
    'Hours spent',
    'Blocked',
    'Work done',
    'Planned work',
    'Blocker',
    'Remarks',
    'Description',
  ]

  const rows = entries.map((entry) => [
    entry.date,
    entry.developerName,
    entry.projectName,
    entry.taskTitle,
    getStatusLabel(entry.status),
    getPriorityLabel(entry.priority),
    String(entry.progress),
    entry.hoursSpent === undefined ? '' : String(entry.hoursSpent),
    entry.isBlocked ? 'Yes' : 'No',
    entry.workDone ?? '',
    entry.plannedWork ?? '',
    entry.blockerDescription ?? '',
    entry.remarks ?? '',
    entry.description ?? '',
  ])

  return [header, ...rows]
}

/**
 * `developer-report-shubham-deshmukh-2026-09-01-to-2026-09-13.csv`
 *
 * The dates stay in ISO form so a folder of these files sorts chronologically,
 * which is not true of the format the report shows on screen.
 */
export function buildDeveloperReportFilename(
  developerName: string,
  filters: DeveloperReportFilters,
): string {
  return `developer-report-${toFilenameSlug(developerName)}-${filters.from}-to-${filters.to}.csv`
}

/** The one-line description of what a generated report covers. */
export function describeReportRange(filters: DeveloperReportFilters): string {
  return `${formatLongDate(filters.from)} to ${formatLongDate(filters.to)}`
}
