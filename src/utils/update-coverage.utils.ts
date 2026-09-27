import type { DailyWorkEntry, Developer, LeaveDay } from '@models/index'

import type { DateRange } from './date.utils'
import { listWorkingDatesInRange } from './date.utils'
import { submitsDailyUpdates } from './work-summary.utils'

/**
 * Which working days a developer has accounted for, and how.
 *
 * Only working days are asked about, and only of people who owe an update —
 * the same two rules the dashboard's missing-update list already applies. A day
 * is answered by an update or by a leave day; anything else is a gap.
 *
 * Deliberately a calculation over rows that already exist rather than a state
 * stored per day. Nothing has to be written when a day passes, and a day that
 * is filled in later stops being missing the moment the entry lands.
 */

export type UpdateDayState = 'leave' | 'missing' | 'submitted'

export interface UpdateDay {
  date: string
  state: UpdateDayState

  /** The note left with a leave day, when there is one. */
  note?: string
}

export interface DeveloperUpdateCoverage {
  developer: Developer

  /** Every working day in the range, newest first. */
  days: UpdateDay[]

  missingDates: string[]
  leaveDates: string[]

  submittedCount: number
  missingCount: number
  leaveCount: number

  /** The most recent day in range that has an update, if any has. */
  lastSubmittedDate?: string
}

export interface UpdateCoverageTotals {
  developersWithGaps: number
  missingDays: number
  leaveDays: number
}

export interface UpdateCoverage {
  range: DateRange
  developers: DeveloperUpdateCoverage[]
  totals: UpdateCoverageTotals
}

export interface UpdateCoverageInput {
  developers: readonly Developer[]
  entries: readonly DailyWorkEntry[]
  leaveDays: readonly LeaveDay[]
  range: DateRange
}

export function buildUpdateCoverage(input: UpdateCoverageInput): UpdateCoverage {
  const dates = [...listWorkingDatesInRange(input.range)].reverse()

  const submitted = groupDatesByDeveloper(input.entries)
  const leave = indexLeaveByDeveloper(input.leaveDays)

  const developers = input.developers
    .filter(submitsDailyUpdates)
    .map((developer) =>
      buildForDeveloper(developer, dates, submitted.get(developer.id), leave.get(developer.id)),
    )

  return {
    range: input.range,
    developers,
    totals: {
      developersWithGaps: developers.filter((row) => row.missingCount > 0).length,
      missingDays: sumBy(developers, (row) => row.missingCount),
      leaveDays: sumBy(developers, (row) => row.leaveCount),
    },
  }
}

/** The gaps only, newest first, for a reader who is filling them in. */
export function findPendingDays(coverage: DeveloperUpdateCoverage | undefined): UpdateDay[] {
  return coverage?.days.filter((day) => day.state === 'missing') ?? []
}

export function findCoverageFor(
  coverage: UpdateCoverage | undefined,
  developerId: string | undefined,
): DeveloperUpdateCoverage | undefined {
  if (coverage === undefined || developerId === undefined) return undefined
  return coverage.developers.find((row) => row.developer.id === developerId)
}

function buildForDeveloper(
  developer: Developer,
  dates: readonly string[],
  submitted: ReadonlySet<string> | undefined,
  leave: ReadonlyMap<string, LeaveDay> | undefined,
): DeveloperUpdateCoverage {
  const days: UpdateDay[] = dates.map((date) => {
    if (submitted?.has(date) === true) return { date, state: 'submitted' }

    const leaveDay = leave?.get(date)
    if (leaveDay === undefined) return { date, state: 'missing' }

    return { date, state: 'leave', ...(leaveDay.note === undefined ? {} : { note: leaveDay.note }) }
  })

  const missingDates = days.filter((day) => day.state === 'missing').map((day) => day.date)
  const leaveDates = days.filter((day) => day.state === 'leave').map((day) => day.date)
  const submittedCount = days.filter((day) => day.state === 'submitted').length

  // `days` is newest first, so the first submitted day is the most recent one.
  const lastSubmitted = days.find((day) => day.state === 'submitted')

  return {
    developer,
    days,
    missingDates,
    leaveDates,
    submittedCount,
    missingCount: missingDates.length,
    leaveCount: leaveDates.length,
    ...(lastSubmitted === undefined ? {} : { lastSubmittedDate: lastSubmitted.date }),
  }
}

/** Several entries may share a day; the question is only whether one exists. */
function groupDatesByDeveloper(entries: readonly DailyWorkEntry[]): Map<string, Set<string>> {
  const byDeveloper = new Map<string, Set<string>>()

  for (const entry of entries) {
    const dates = byDeveloper.get(entry.developerId) ?? new Set<string>()
    dates.add(entry.date)
    byDeveloper.set(entry.developerId, dates)
  }

  return byDeveloper
}

function indexLeaveByDeveloper(leaveDays: readonly LeaveDay[]): Map<string, Map<string, LeaveDay>> {
  const byDeveloper = new Map<string, Map<string, LeaveDay>>()

  for (const leaveDay of leaveDays) {
    const dates = byDeveloper.get(leaveDay.developerId) ?? new Map<string, LeaveDay>()
    dates.set(leaveDay.date, leaveDay)
    byDeveloper.set(leaveDay.developerId, dates)
  }

  return byDeveloper
}

function sumBy<TItem>(items: readonly TItem[], read: (item: TItem) => number): number {
  return items.reduce((total, item) => total + read(item), 0)
}
