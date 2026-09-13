import { useMemo } from 'react'

import { useDailyWorkEntries } from '@hooks/use-work-tracker'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { getStatusLabel, getPriorityLabel } from '@utils/task.utils'
import { toFilenameSlug } from '@utils/csv.utils'
import { formatLongDate } from '@utils/date.utils'
import type { StatusBreakdown } from '@utils/work-summary.utils'
import { calculateCompletionRate, sumHoursLogged, summariseStatuses } from '@utils/work-summary.utils'

// Authorization is enforced by `daily_updates_select` RLS, not by this hook.
export interface DeveloperReportFilters {
  developerId: string
  projectId: string
  from: string
  to: string
}

export interface DeveloperReportSummary {
  statuses: StatusBreakdown
  updateCount: number
  tasksWorkedOn: number
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

// Empty developerIds skips the fetch until Generate is pressed.
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
    isPending: filters !== null && query.isPending,
    error: query.error,
  }
}

export function buildEntriesCsv(entries: readonly DailyWorkEntryView[]): string[][] {
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

export function buildDeveloperReportFilename(
  developerName: string,
  filters: DeveloperReportFilters,
): string {
  return `developer-report-${toFilenameSlug(developerName)}-${filters.from}-to-${filters.to}.csv`
}

export function describeReportRange(filters: DeveloperReportFilters): string {
  return `${formatLongDate(filters.from)} to ${formatLongDate(filters.to)}`
}
