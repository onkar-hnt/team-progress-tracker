import type { DailyWorkEntry, Developer, Project } from '@models/index'

import type { DateRange } from './date.utils'
import { isWorkingDay, listDatesInRange } from './date.utils'
import { isEntryBlocked, isEntryCompleted } from './task.utils'

/** Aggregations over daily work entries; callers supply the filtered set. */

export interface StatusBreakdown {
  total: number

  /** Mutually exclusive; sum to total. */
  notStarted: number
  inProgress: number
  completed: number
  blocked: number

  /** Blocked by status or IsBlocked; overlaps the counts above. */
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

/** Active developers with no entry on a working day. */
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

/** Admins and mentors do not submit daily updates. */
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
  developersUpdated: number
}

/** One point per day in range, including days with no activity. */
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

export function findBlockedEntries<TEntry extends DailyWorkEntry>(
  entries: readonly TEntry[],
): TEntry[] {
  return entries.filter(isEntryBlocked)
}
