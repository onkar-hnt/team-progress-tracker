import type { DailyWorkQuery } from '@models/index'
import type { DateRange } from '@utils/date.utils'

/**
 * Central query-key definitions.
 *
 * Keys are declared once so that invalidating after a save cannot miss a
 * screen because two files spelled a key differently. Every key starts with
 * `work-tracker`, which makes it possible to invalidate all server state in
 * one call.
 */
const ROOT = 'work-tracker' as const

export const queryKeys = {
  root: [ROOT] as const,

  developers: () => [ROOT, 'developers'] as const,

  projects: () => [ROOT, 'projects'] as const,

  /** `null` rather than `undefined` so the key serialises consistently. */
  dailyWork: (query?: DailyWorkQuery) => [ROOT, 'daily-work', query ?? null] as const,

  dailyWorkEntry: (id: string) => [ROOT, 'daily-work', 'entry', id] as const,

  dayOverview: (isoDate: string) => [ROOT, 'day-overview', isoDate] as const,

  rangeOverview: (range: DateRange) => [ROOT, 'range-overview', range.from, range.to] as const,
}
