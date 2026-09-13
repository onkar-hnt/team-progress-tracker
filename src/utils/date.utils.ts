import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNowStrict,
  getISODay,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

import { WORKING_WEEKDAYS } from '@constants/team.constants'

/** Calendar-day helpers on yyyy-MM-dd strings to avoid timezone shifts. */

/** Monday, matching how the team reads a working week. */
const WEEK_STARTS_ON = 1

export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function todayIsoDate(): string {
  return toIsoDate(new Date())
}

export function parseIsoDate(isoDate: string): Date | null {
  const parsed = parseISO(isoDate)
  return isValid(parsed) ? parsed : null
}

/** ISO weekday, Monday = 1 through Sunday = 7. */
export function getWeekday(isoDate: string): number | null {
  const parsed = parseIsoDate(isoDate)
  return parsed === null ? null : getISODay(parsed)
}

/** Weekends excluded; public holidays not modelled yet. */
export function isWorkingDay(isoDate: string): boolean {
  const weekday = getWeekday(isoDate)
  return weekday !== null && WORKING_WEEKDAYS.includes(weekday)
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const parsed = parseIsoDate(isoDate)
  return parsed === null ? isoDate : toIsoDate(addDays(parsed, days))
}

export interface DateRange {
  from: string
  to: string
}

export function getWeekRange(isoDate: string): DateRange {
  const parsed = parseIsoDate(isoDate)
  if (parsed === null) return { from: isoDate, to: isoDate }

  return {
    from: toIsoDate(startOfWeek(parsed, { weekStartsOn: WEEK_STARTS_ON })),
    to: toIsoDate(endOfWeek(parsed, { weekStartsOn: WEEK_STARTS_ON })),
  }
}

export function getTrailingRange(isoDate: string, days: number): DateRange {
  const span = Math.max(1, days)
  return { from: shiftIsoDate(isoDate, -(span - 1)), to: isoDate }
}

export function getMonthRange(isoDate: string): DateRange {
  const parsed = parseIsoDate(isoDate)
  if (parsed === null) return { from: isoDate, to: isoDate }

  return { from: toIsoDate(startOfMonth(parsed)), to: toIsoDate(endOfMonth(parsed)) }
}

export function getSingleDayRange(isoDate: string): DateRange {
  return { from: isoDate, to: isoDate }
}

export function listDatesInRange(range: DateRange): string[] {
  const start = parseIsoDate(range.from)
  const end = parseIsoDate(range.to)
  if (start === null || end === null || start > end) return []

  return eachDayOfInterval({ start, end }).map(toIsoDate)
}

export function listWorkingDatesInRange(range: DateRange): string[] {
  return listDatesInRange(range).filter(isWorkingDay)
}

export function toNearestWorkingDay(isoDate: string): string {
  let candidate = isoDate

  // A week of look-back is always enough to find a working day.
  for (let attempt = 0; attempt < 7; attempt += 1) {
    if (isWorkingDay(candidate)) return candidate
    candidate = shiftIsoDate(candidate, -1)
  }

  return isoDate
}

export function formatShortDate(isoDate: string): string {
  const parsed = parseIsoDate(isoDate)
  return parsed === null ? isoDate : format(parsed, 'dd MMM')
}

export function formatLongDate(isoDate: string): string {
  const parsed = parseIsoDate(isoDate)
  return parsed === null ? isoDate : format(parsed, 'dd MMM yyyy')
}

export function formatWeekday(isoDate: string): string {
  const parsed = parseIsoDate(isoDate)
  return parsed === null ? '' : format(parsed, 'EEE')
}

export function formatTimestamp(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp)
  return Number.isNaN(parsed.getTime()) ? isoTimestamp : format(parsed, 'dd MMM yyyy, HH:mm')
}

/** Whole days since a timestamp; truncated for threshold checks. */
export function daysSince(isoTimestamp: string, now: Date = new Date()): number | null {
  const parsed = new Date(isoTimestamp)
  if (Number.isNaN(parsed.getTime())) return null

  return Math.floor((now.getTime() - parsed.getTime()) / (24 * 60 * 60 * 1000))
}

/** Relative time for recent items; falls back to a date after one week. */
export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const parsed = new Date(isoTimestamp)
  if (Number.isNaN(parsed.getTime())) return isoTimestamp

  const elapsedMs = now.getTime() - parsed.getTime()
  const weekMs = 7 * 24 * 60 * 60 * 1000

  if (elapsedMs >= weekMs) return format(parsed, 'dd MMM yyyy')

  // Under a minute reads as "0 minutes ago" otherwise.
  if (elapsedMs < 60_000) return 'Just now'

  return `${formatDistanceToNowStrict(parsed)} ago`
}
