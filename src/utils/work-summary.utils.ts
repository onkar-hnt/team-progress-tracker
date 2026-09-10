import type { DailyWorkEntry, Developer, Project } from '@models/index'

import type { DateRange } from './date.utils'
import { isWorkingDay, listDatesInRange } from './date.utils'
import { isEntryBlocked, isEntryCompleted } from './task.utils'

/**
 * Pure aggregations over daily work entries.
 *
 * Every dashboard, report and developer view is derived from `tblDailyWork`
 * here rather than from pre-computed sheets, so the workbook stays a single
 * normalised source and no date-wise worksheets are ever generated.
 *
 * These functions take already-filtered entries. Callers decide the period,
 * which keeps "today", "this week" and custom ranges on one code path.
 */

export interface StatusBreakdown {
  total: number

  /**
   * Counts by `Status`. Mutually exclusive, so these four always sum to
   * `total` and are safe to use in a pie or stacked chart.
   */
  notStarted: number
  inProgress: number
  completed: number
  blocked: number

  /**
   * Entries blocked by status *or* by the `IsBlocked` flag.
   *
   * This is the number the mentor cares about, and it overlaps the counts
   * above, so it must not be added to them in a chart.
   */
  needsAttention: number
}

export function summariseStatuses(entries: readonly DailyWorkEntry[]): StatusBreakdown {
  const breakdown: StatusBreakdown = {
    total: entries.length,
    notStarted: 0,
    inProgress: 0,
    completed: 0,
    blocked: 0,
    needsAttention: 0,
  }

  for (const entry of entries) {
    switch (entry.status) {
      case 'not-started':
        breakdown.notStarted += 1
        break
      case 'in-progress':
        breakdown.inProgress += 1
        break
      case 'completed':
        breakdown.completed += 1
        break
      case 'blocked':
        breakdown.blocked += 1
        break
    }

    if (isEntryBlocked(entry)) breakdown.needsAttention += 1
  }

  return breakdown
}

/**
 * Completed share of the given entries, as a percentage to one decimal place.
 *
 * An empty period returns 0 rather than `NaN`, so cards can render it
 * directly without guarding.
 */
export function calculateCompletionRate(entries: readonly DailyWorkEntry[]): number {
  if (entries.length === 0) return 0
  const completed = entries.filter(isEntryCompleted).length
  return Math.round((completed / entries.length) * 1000) / 10
}

export function sumHoursLogged(entries: readonly DailyWorkEntry[]): number {
  const total = entries.reduce((sum, entry) => sum + (entry.hoursSpent ?? 0), 0)
  return Math.round(total * 100) / 100
}

export interface DeveloperSummary {
  developer: Developer
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  /** Distinct days with at least one entry, a proxy for update consistency. */
  daysLogged: number
}

export function buildDeveloperSummaries(
  developers: readonly Developer[],
  entries: readonly DailyWorkEntry[],
): DeveloperSummary[] {
  return developers.map((developer) => {
    const own = entries.filter((entry) => entry.developerId === developer.id)

    return {
      developer,
      statuses: summariseStatuses(own),
      completionRate: calculateCompletionRate(own),
      hoursLogged: sumHoursLogged(own),
      daysLogged: new Set(own.map((entry) => entry.date)).size,
    }
  })
}

export interface ProjectSummary {
  project: Project
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  /** How many people touched the project, useful for spotting single points of knowledge. */
  contributorCount: number
}

export function buildProjectSummaries(
  projects: readonly Project[],
  entries: readonly DailyWorkEntry[],
): ProjectSummary[] {
  return projects.map((project) => {
    const own = entries.filter((entry) => entry.projectId === project.id)

    return {
      project,
      statuses: summariseStatuses(own),
      completionRate: calculateCompletionRate(own),
      hoursLogged: sumHoursLogged(own),
      contributorCount: new Set(own.map((entry) => entry.developerId)).size,
    }
  })
}

/**
 * Active developers with no entry for `isoDate`.
 *
 * Only active developers are considered, and only on working days: asking who
 * failed to update on a Sunday would produce noise rather than information.
 * Inactive developers are excluded so a departed colleague never appears.
 *
 * `entries` must already cover `isoDate`; anything outside it is ignored.
 */
export function findDevelopersMissingUpdate(
  developers: readonly Developer[],
  entries: readonly DailyWorkEntry[],
  isoDate: string,
): Developer[] {
  if (!isWorkingDay(isoDate)) return []

  const updated = new Set(
    entries.filter((entry) => entry.date === isoDate).map((entry) => entry.developerId),
  )

  return developers.filter(
    (developer) => submitsDailyUpdates(developer) && !updated.has(developer.id),
  )
}

/**
 * Whether a daily update is expected from this person.
 *
 * Admin and mentor rows are excluded: they exist in the Employees table so
 * they can sign in, not because they log daily work, and listing them as
 * missing an update every day would train people to ignore the panel.
 */
export function submitsDailyUpdates(developer: Developer): boolean {
  if (!developer.active) return false
  return developer.accessRole === undefined || developer.accessRole === 'developer'
}

export function findDevelopersWithUpdate(
  developers: readonly Developer[],
  entries: readonly DailyWorkEntry[],
  isoDate: string,
): Developer[] {
  const updated = new Set(
    entries.filter((entry) => entry.date === isoDate).map((entry) => entry.developerId),
  )

  return developers.filter((developer) => updated.has(developer.id))
}

export interface DailyTrendPoint {
  date: string
  total: number
  completed: number
  needsAttention: number
  hoursLogged: number
  /** Distinct developers who logged work, for update-consistency trends. */
  developersUpdated: number
}

/**
 * One point per day across `range`, including days with no activity.
 *
 * Empty days are kept deliberately: a gap in the line is the signal, and
 * dropping those days would silently compress the x-axis.
 */
export function buildDailyTrend(
  entries: readonly DailyWorkEntry[],
  range: DateRange,
): DailyTrendPoint[] {
  return listDatesInRange(range).map((date) => {
    const forDate = entries.filter((entry) => entry.date === date)

    return {
      date,
      total: forDate.length,
      completed: forDate.filter(isEntryCompleted).length,
      needsAttention: forDate.filter(isEntryBlocked).length,
      hoursLogged: sumHoursLogged(forDate),
      developersUpdated: new Set(forDate.map((entry) => entry.developerId)).size,
    }
  })
}

/** Generic over the entry type so enriched view objects keep their extra fields. */
export function findBlockedEntries<TEntry extends DailyWorkEntry>(
  entries: readonly TEntry[],
): TEntry[] {
  return entries.filter(isEntryBlocked)
}
