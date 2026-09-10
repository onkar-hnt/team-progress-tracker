import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import type { TaskPriority, TaskStatus } from '@models/daily-work.model'

/**
 * Display labels for the UI.
 *
 * These intentionally duplicate the strings used by the Excel layer. They are
 * presentation data and may be reworded freely; the workbook's accepted values
 * are defined separately in `excel-schema.ts` and must not change.
 */
export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  'not-started': 'Not Started',
  'in-progress': 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
}

export const TASK_PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export interface SelectOption<TValue extends string> {
  label: string
  value: TValue
}

/** Ordered options for status dropdowns and chart legends. */
export const TASK_STATUS_OPTIONS: readonly SelectOption<TaskStatus>[] = TASK_STATUSES.map(
  (status) => ({ label: TASK_STATUS_LABELS[status], value: status }),
)

/** Ordered from least to most urgent. */
export const TASK_PRIORITY_OPTIONS: readonly SelectOption<TaskPriority>[] = TASK_PRIORITIES.map(
  (priority) => ({ label: TASK_PRIORITY_LABELS[priority], value: priority }),
)

export const PROGRESS_MIN = 0

export const PROGRESS_MAX = 100

/**
 * Progress choices offered in the daily update form.
 *
 * Progress is picked from a list rather than typed, because a free number
 * field invites values like 37% that carry no more meaning than 40% and make
 * trends noisier. `progress` stays a plain number in the model so a slider or
 * free input remains possible without a data change.
 */
export const PROGRESS_STEP = 10

export const PROGRESS_OPTIONS: readonly SelectOption<string>[] = Array.from(
  { length: PROGRESS_MAX / PROGRESS_STEP + 1 },
  (_unused, index) => {
    const value = index * PROGRESS_STEP
    return { label: `${value}%`, value: String(value) }
  },
)

export const HOURS_SPENT_STEP = 0.5

export const HOURS_SPENT_MAX = 12

/**
 * Hours are chosen in half-hour steps.
 *
 * Half an hour is the finest granularity anybody recalls accurately at the end
 * of a day, and a fixed list keeps the form to a couple of taps on mobile.
 */
export const HOURS_SPENT_OPTIONS: readonly SelectOption<string>[] = Array.from(
  { length: HOURS_SPENT_MAX / HOURS_SPENT_STEP },
  (_unused, index) => {
    const value = (index + 1) * HOURS_SPENT_STEP
    return { label: value === 1 ? '1 hour' : `${value} hours`, value: String(value) }
  },
)
