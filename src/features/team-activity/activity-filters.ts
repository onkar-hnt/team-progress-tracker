import type { DailyWorkQuery, TaskPriority, TaskStatus } from '@models/index'
import type { DateRange } from '@utils/date.utils'
import {
  getMonthRange,
  getSingleDayRange,
  getTrailingRange,
  getWeekRange,
  todayIsoDate,
} from '@utils/date.utils'

/**
 * Filter state for the team activity screen.
 *
 * Presets and a custom range share one representation so the table, the query
 * and the reports screen all read the period the same way.
 */

export const PERIOD_PRESETS = ['today', 'this-week', 'last-7-days', 'this-month', 'custom'] as const

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export const PERIOD_PRESET_LABELS: Readonly<Record<PeriodPreset, string>> = {
  today: 'Today',
  'this-week': 'This week',
  'last-7-days': 'Last 7 days',
  'this-month': 'This month',
  custom: 'Custom range',
}

export interface ActivityFilterState {
  preset: PeriodPreset
  /** Only used when `preset` is `custom`; kept so switching back is lossless. */
  customRange: DateRange
  developerId: string
  projectId: string
  status: TaskStatus | ''
  priority: TaskPriority | ''
  blockedOnly: boolean
  /** Free-text match against task title, description and remarks. */
  search: string
}

export function createDefaultFilters(): ActivityFilterState {
  const today = todayIsoDate()

  return {
    preset: 'this-week',
    customRange: getWeekRange(today),
    developerId: '',
    projectId: '',
    status: '',
    priority: '',
    blockedOnly: false,
    search: '',
  }
}

export function resolvePeriod(filters: ActivityFilterState): DateRange {
  const today = todayIsoDate()

  switch (filters.preset) {
    case 'today':
      return getSingleDayRange(today)
    case 'this-week':
      return getWeekRange(today)
    case 'last-7-days':
      return getTrailingRange(today, 7)
    case 'this-month':
      return getMonthRange(today)
    case 'custom':
      return filters.customRange
  }
}

/**
 * Translates filter state into a provider query.
 *
 * Only filters the data layer can express are included; free-text search stays
 * client-side because the workbook cannot search efficiently and the result
 * set for one team is small.
 */
export function toDailyWorkQuery(filters: ActivityFilterState): DailyWorkQuery {
  const period = resolvePeriod(filters)

  return {
    dateFrom: period.from,
    dateTo: period.to,
    ...(filters.developerId === '' ? {} : { developerIds: [filters.developerId] }),
    ...(filters.projectId === '' ? {} : { projectIds: [filters.projectId] }),
    ...(filters.status === '' ? {} : { statuses: [filters.status] }),
    ...(filters.priority === '' ? {} : { priorities: [filters.priority] }),
    ...(filters.blockedOnly ? { isBlocked: true } : {}),
  }
}

export function matchesSearch(
  fields: readonly (string | undefined)[],
  search: string,
): boolean {
  const term = search.trim().toLowerCase()
  if (term === '') return true

  return fields.some((field) => field !== undefined && field.toLowerCase().includes(term))
}
