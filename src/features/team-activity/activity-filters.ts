import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@constants/task.constants'
import type { DailyWorkQuery, TaskPriority, TaskStatus } from '@models/index'
import type { AccessScope } from '@services/auth/index'
import { canRequestProject, canViewDeveloper } from '@services/auth/index'
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

/**
 * The list request for the current filters.
 *
 * Search stays off this object: the provider has no text column for it, so the
 * page narrows the returned rows. Every other control is part of the request,
 * so changing it changes the query key and `list_daily_updates` runs again.
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

/**
 * The filter that puts this view outside what the signed-in person may read,
 * or null when the view is reachable.
 *
 * A link from another screen, or a pasted URL, can name a developer or project
 * the scope does not cover. The data layer answers that with no rows and no
 * request, which is indistinguishable from a quiet week unless the screen says
 * which filter is responsible.
 */
export function unreachableFilter(
  scope: AccessScope | null,
  filters: ActivityFilterState,
): 'developer' | 'project' | null {
  if (scope === null) return null

  if (filters.developerId !== '' && !canViewDeveloper(scope, filters.developerId)) {
    return 'developer'
  }

  if (filters.projectId !== '' && !canRequestProject(scope, filters.projectId)) return 'project'

  return null
}

// Older links put a slice in the query string. The page reads that once, then
// drops it. Changing a filter does not write the address bar.
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

export interface ActivitySlice {
  status?: TaskStatus
  developerId?: string
  projectId?: string
  blockedOnly?: boolean
}

/** Router state for a drill-down. The path stays `/team-activity` with no query string. */
export function activityRangeLink(range: DateRange, slice: ActivitySlice = {}): {
  pathname: '/team-activity'
  state: { activityFilters: ActivityFilterState }
} {
  return {
    pathname: '/team-activity',
    state: {
      activityFilters: {
        ...createDefaultFilters(),
        preset: 'custom',
        customRange: range,
        ...(slice.status === undefined ? {} : { status: slice.status }),
        ...(slice.developerId === undefined ? {} : { developerId: slice.developerId }),
        ...(slice.projectId === undefined ? {} : { projectId: slice.projectId }),
        ...(slice.blockedOnly === undefined ? {} : { blockedOnly: slice.blockedOnly }),
      },
    },
  }
}

export function activityLink(date: string, slice: ActivitySlice = {}): {
  pathname: '/team-activity'
  state: { activityFilters: ActivityFilterState }
} {
  return activityRangeLink({ from: date, to: date }, slice)
}

export function activityFiltersFromNavigation(
  state: unknown,
  params: URLSearchParams,
): ActivityFilterState {
  if (typeof state === 'object' && state !== null && 'activityFilters' in state) {
    const filters = state.activityFilters
    if (isActivityFilterState(filters)) return filters
  }

  return filtersFromSearchParams(params)
}

function isActivityFilterState(value: unknown): value is ActivityFilterState {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as ActivityFilterState
  const preset = PERIOD_PRESETS.find((item) => item === candidate.preset)

  return (
    preset !== undefined &&
    typeof candidate.developerId === 'string' &&
    typeof candidate.projectId === 'string' &&
    typeof candidate.customRange?.from === 'string' &&
    typeof candidate.customRange?.to === 'string'
  )
}

