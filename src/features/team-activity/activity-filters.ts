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

/**
 * The filters, in the address bar.
 *
 * ## Why the URL and not `useState`
 *
 * Because something else needs to set them. The dashboard's metrics are counts of
 * exactly the rows this screen lists, and a reader whose eye stops on "Needs attention:
 * 3" wants those three — which was a card that lifted under the cursor and went nowhere,
 * or at best to an unfiltered list of everything, leaving them to reproduce the filter by
 * hand from a number they had already been shown.
 *
 * A link cannot reach into another screen's `useState`, so the filters moved to where a
 * link can address them. Two things fall out of that for free: a filtered view can be
 * sent to somebody, and the back button undoes a filter change the way it looks like it
 * should.
 *
 * ## What the parameters are called, and why they are checked
 *
 * Short names, because these appear in a link somebody may read or type: `?blocked=1`
 * rather than `?blockedOnly=true`. Every value is validated against what it is allowed to
 * be and falls back to the default when it is not — a URL is user input, and `?status=xyz`
 * should show the ordinary screen rather than an empty table filtered by a status that
 * does not exist.
 *
 * Defaults are left out when writing. The plain path is the plain screen, and a parameter
 * list holds only what somebody actually chose.
 */

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

/** `2026-09-13`, and nothing else. The date inputs and every provider agree on this. */
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

    // Held whichever preset is in force, so switching to Custom and back is lossless —
    // the same reason the field exists at all. A link that gives dates without saying
    // `period=custom` is treating them as the custom range it means to select.
    customRange: {
      from: from ?? defaults.customRange.from,
      to: to ?? defaults.customRange.to,
    },

    // Not checked against the roster, unlike the status and the priority: the ids are only
    // known once the developers and projects have loaded, and a filter that silently
    // cleared itself while a request was in flight would be worse than one naming somebody
    // who has since been removed. That case shows an empty table, which is the truth.
    developerId: params.get(PARAMS.developer) ?? defaults.developerId,
    projectId: params.get(PARAMS.project) ?? defaults.projectId,

    status: status in TASK_STATUS_LABELS ? (status as TaskStatus) : '',
    priority: priority in TASK_PRIORITY_LABELS ? (priority as TaskPriority) : '',

    // Any value at all means on, so `?blocked=1` and `?blocked=true` both work. Somebody
    // typing one of those has said what they mean.
    blockedOnly: params.get(PARAMS.blocked) !== null,

    search: params.get(PARAMS.search) ?? defaults.search,
  }
}

export function filtersToSearchParams(filters: ActivityFilterState): URLSearchParams {
  const defaults = createDefaultFilters()
  const params = new URLSearchParams()

  if (filters.preset !== defaults.preset) params.set(PARAMS.period, filters.preset)

  // Only for a custom range. Written for any other preset they would be a pair of dates
  // the screen is ignoring, which is the kind of URL that gets pasted into a chat and
  // argued about.
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

/**
 * What can be picked out of a period: a status, one person, one project, or only what is
 * blocked. The same four things the activity screen's own filters offer, which is not a
 * coincidence — a link that could express more than the screen can would be a link to a view
 * nobody could then adjust.
 */
export interface ActivitySlice {
  status?: TaskStatus
  developerId?: string
  projectId?: string
  blockedOnly?: boolean
}

/**
 * A link to this screen, showing one slice of one period.
 *
 * Here rather than on the dashboard so that the parameter names stay private to this
 * module: a screen that wants to link to a filtered activity list says what it wants in
 * domain terms, and if a parameter is ever renamed there is one place it is spelled.
 *
 * The period arrives as an explicit range rather than as a preset because the callers have one
 * — the dashboard knows the week it is showing, the reports screen the range that was chosen —
 * and translating that back into whichever preset happens to match today would be a link that
 * means something different tomorrow.
 */
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

/** The same, for the common case of a single day. */
export function activityLink(date: string, slice: ActivitySlice = {}): string {
  return activityRangeLink({ from: date, to: date }, slice)
}

/**
 * Re-exported rather than defined here any longer.
 *
 * It was this screen's own until the administration tables and the Logins screen
 * wanted the same behaviour, and it is now `@utils/table.utils`. The name stays
 * exported from this module so the two call sites on this screen read as they did
 * — and because it belongs in a list of this screen's filters even when the
 * implementation does not live here.
 */
export { matchesSearch } from '@utils/table.utils'
