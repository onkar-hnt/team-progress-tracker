import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import type { TaskPriority, TaskStatus } from '@models/daily-work.model'

/** UI labels only; the values stored in the database are the model's own. */
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

export const TASK_STATUS_OPTIONS: readonly SelectOption<TaskStatus>[] = TASK_STATUSES.map(
  (status) => ({ label: TASK_STATUS_LABELS[status], value: status }),
)

export const TASK_PRIORITY_OPTIONS: readonly SelectOption<TaskPriority>[] = TASK_PRIORITIES.map(
  (priority) => ({ label: TASK_PRIORITY_LABELS[priority], value: priority }),
)

export const PROGRESS_MIN = 0

export const PROGRESS_MAX = 100

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

export const HOURS_SPENT_OPTIONS: readonly SelectOption<string>[] = Array.from(
  { length: HOURS_SPENT_MAX / HOURS_SPENT_STEP },
  (_unused, index) => {
    const value = (index + 1) * HOURS_SPENT_STEP
    return { label: value === 1 ? '1 hour' : `${value} hours`, value: String(value) }
  },
)
