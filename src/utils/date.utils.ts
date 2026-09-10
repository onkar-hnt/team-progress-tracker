import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISODay,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

import { WORKING_WEEKDAYS } from '@constants/team.constants'

/**
 * Calendar-day helpers built on `yyyy-MM-dd` strings.
 *
 * The application stores work dates as plain calendar days because "the day a
 * developer logged work" has no time or timezone. Keeping them as strings and
 * only converting at the edges avoids the classic bug where a UTC conversion
 * shifts an entry into the previous day for anyone east of Greenwich.
 *
 * Zero-padded ISO days also compare and sort correctly as plain strings.
 */

/** Monday, matching how the team reads a working week. */
const WEEK_STARTS_ON = 1

export function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function todayIsoDate(): string {
  return toIsoDate(new Date())
}

/** Parses a calendar day into a local `Date`, or `null` when malformed. */
export function parseIsoDate(isoDate: string): Date | null {
  const parsed = parseISO(isoDate)
  return isValid(parsed) ? parsed : null
}

/** ISO weekday, Monday = 1 through Sunday = 7. */
export function getWeekday(isoDate: string): number | null {
  const parsed = parseIsoDate(isoDate)
  return parsed === null ? null : getISODay(parsed)
}

/**
 * Whether the team is expected to log work on this day.
 *
 * Weekends are excluded. Public holidays and leave are not modelled yet, so a
 * holiday still counts as a working day and will show as a missing update.
 */
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

/** Monday-to-Sunday range containing `isoDate`. */
export function getWeekRange(isoDate: string): DateRange {
  const parsed = parseIsoDate(isoDate)
  if (parsed === null) return { from: isoDate, to: isoDate }

  return {
    from: toIsoDate(startOfWeek(parsed, { weekStartsOn: WEEK_STARTS_ON })),
    to: toIsoDate(endOfWeek(parsed, { weekStartsOn: WEEK_STARTS_ON })),
  }
}

/** Inclusive range ending on `isoDate`, spanning `days` days in total. */
export function getTrailingRange(isoDate: string, days: number): DateRange {
  const span = Math.max(1, days)
  return { from: shiftIsoDate(isoDate, -(span - 1)), to: isoDate }
}

/** Calendar month containing `isoDate`. */
export function getMonthRange(isoDate: string): DateRange {
  const parsed = parseIsoDate(isoDate)
  if (parsed === null) return { from: isoDate, to: isoDate }

  return { from: toIsoDate(startOfMonth(parsed)), to: toIsoDate(endOfMonth(parsed)) }
}

/** Single-day range, for screens that filter by one date. */
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

/** The most recent working day at or before `isoDate`. */
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

/** Formats an audit timestamp for display, tolerating unparseable values. */
export function formatTimestamp(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp)
  return Number.isNaN(parsed.getTime()) ? isoTimestamp : format(parsed, 'dd MMM yyyy, HH:mm')
}
