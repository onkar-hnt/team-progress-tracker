import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@constants/task.constants'
import type { DailyWorkQuery, TaskPriority, TaskStatus } from '@models/index'
import type { DateRange } from '@utils/date.utils'
import {
  getMonthRange,
  getSingleDayRange,
  getTrailingRange,
  getWeekRange,
  todayIsoDate,
} from '@utils/date.utils'

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
  customRange: DateRange
  developerId: string
  projectId: string
  status: TaskStatus | ''
  priority: TaskPriority | ''
  blockedOnly: boolean
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

// Search stays client-side; the provider only filters indexed columns.
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

// Filters live in the URL so other screens can link to a slice. Values are validated; defaults are omitted.
const PARAMS = {
  blocked: 'blocked',
  developer: 'developer',
  from: 'from',
  period: 'period',
  priority: 'priority',
  project: 'project',
  search: 'q',
  status: 'status',
  to: 'to',
} as const

// ISO date format expected by inputs and providers.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u

function readPreset(value: string | null): PeriodPreset | undefined {
  return PERIOD_PRESETS.find((preset) => preset === value)
}

function readDate(value: string | null): string | undefined {
  return value !== null && ISO_DATE.test(value) ? value : undefined
}

export function filtersFromSearchParams(params: URLSearchParams): ActivityFilterState {
  const defaults = createDefaultFilters()

  const preset = readPreset(params.get(PARAMS.period)) ?? defaults.preset
  const from = readDate(params.get(PARAMS.from))
  const to = readDate(params.get(PARAMS.to))

  const status = params.get(PARAMS.status) ?? ''
  const priority = params.get(PARAMS.priority) ?? ''

  return {
    preset,

    customRange: {
      from: from ?? defaults.customRange.from,
      to: to ?? defaults.customRange.to,
    },

    // Not validated against the roster until developers and projects have loaded.
    developerId: params.get(PARAMS.developer) ?? defaults.developerId,
    projectId: params.get(PARAMS.project) ?? defaults.projectId,

    status: status in TASK_STATUS_LABELS ? (status as TaskStatus) : '',
    priority: priority in TASK_PRIORITY_LABELS ? (priority as TaskPriority) : '',

    // Any value enables blocked-only (?blocked=1 or ?blocked=true).
    blockedOnly: params.get(PARAMS.blocked) !== null,

    search: params.get(PARAMS.search) ?? defaults.search,
  }
}

export function filtersToSearchParams(filters: ActivityFilterState): URLSearchParams {
  const defaults = createDefaultFilters()
  const params = new URLSearchParams()

  if (filters.preset !== defaults.preset) params.set(PARAMS.period, filters.preset)

  if (filters.preset === 'custom') {
    params.set(PARAMS.from, filters.customRange.from)
    params.set(PARAMS.to, filters.customRange.to)
  }

  if (filters.developerId !== '') params.set(PARAMS.developer, filters.developerId)
  if (filters.projectId !== '') params.set(PARAMS.project, filters.projectId)
  if (filters.status !== '') params.set(PARAMS.status, filters.status)
  if (filters.priority !== '') params.set(PARAMS.priority, filters.priority)
  if (filters.blockedOnly) params.set(PARAMS.blocked, '1')
  if (filters.search !== '') params.set(PARAMS.search, filters.search)

  return params
}

export interface ActivitySlice {
  status?: TaskStatus
  developerId?: string
  projectId?: string
  blockedOnly?: boolean
}

export function activityRangeLink(range: DateRange, slice: ActivitySlice = {}): string {
  const params = filtersToSearchParams({
    ...createDefaultFilters(),
    preset: 'custom',
    customRange: range,
    ...(slice.status === undefined ? {} : { status: slice.status }),
    ...(slice.developerId === undefined ? {} : { developerId: slice.developerId }),
    ...(slice.projectId === undefined ? {} : { projectId: slice.projectId }),
    ...(slice.blockedOnly === undefined ? {} : { blockedOnly: slice.blockedOnly }),
  })

  return `/team-activity?${params.toString()}`
}

export function activityLink(date: string, slice: ActivitySlice = {}): string {
  return activityRangeLink({ from: date, to: date }, slice)
}

export { matchesSearch } from '@utils/table.utils'
