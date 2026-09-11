import {
  PROGRESS_MAX,
  PROGRESS_MIN,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '@constants/task.constants'
import type { DailyWorkEntry, TaskPriority, TaskStatus } from '@models/index'

/**
 * Whether an entry should be treated as blocked.
 *
 * `Status` and `IsBlocked` are separate columns that can disagree: a developer
 * may flag a blocker while leaving the status as In Progress. Treating either
 * signal as blocked means the mentor never misses one.
 */
export function isEntryBlocked(entry: DailyWorkEntry): boolean {
  return entry.isBlocked || entry.status === 'blocked'
}

export function isEntryCompleted(entry: DailyWorkEntry): boolean {
  return entry.status === 'completed'
}

/**
 * The progress a status implies, or `null` where any value is legitimate.
 *
 * Status and progress are separate fields that can be made to contradict
 * each other, and "Completed · 50%" says nothing anybody can act on. Shared
 * between the daily update form and the inline status control on the
 * dashboard so the two cannot apply different rules to the same edit.
 *
 * In-progress and blocked return `null`: a blocked task may sit at any
 * percentage, and overwriting what the developer chose would lose the only
 * number they had thought about.
 */
export function progressForStatus(status: TaskStatus): number | null {
  if (status === 'completed') return PROGRESS_MAX
  if (status === 'not-started') return PROGRESS_MIN
  return null
}

export function getStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status]
}

export function getPriorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITY_LABELS[priority]
}

/** Newest first, by work date then by last update. */
export function sortByMostRecent<TEntry extends DailyWorkEntry>(
  entries: readonly TEntry[],
): TEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) return right.date.localeCompare(left.date)
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

/** Critical first, so the mentor sees urgent work at the top. */
const PRIORITY_WEIGHT: Readonly<Record<TaskPriority, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/**
 * Workflow order rather than alphabetical, so sorting a table by status walks
 * a task from untouched to finished and keeps blockers next to active work.
 */
const STATUS_WEIGHT: Readonly<Record<TaskStatus, number>> = {
  'not-started': 0,
  'in-progress': 1,
  blocked: 2,
  completed: 3,
}

/** Comparators for table sorting, negative when `left` sorts first. */
export function comparePriority(left: TaskPriority, right: TaskPriority): number {
  return PRIORITY_WEIGHT[left] - PRIORITY_WEIGHT[right]
}

export function compareStatus(left: TaskStatus, right: TaskStatus): number {
  return STATUS_WEIGHT[left] - STATUS_WEIGHT[right]
}

/**
 * The shape a task needs to appear in a picker.
 *
 * Structural rather than the concrete `AssignedTaskView`, so these two live
 * in utils without reaching back into the service layer for a type. Every
 * caller passes the view.
 */
export interface TaskOption {
  id: string
  name: string
  status: TaskStatus
  projectName: string
  isOverdue: boolean
}

/** Name, project and urgency, so one option identifies the work unambiguously. */
export function describeTask(task: TaskOption): string {
  return `${task.name} · ${task.projectName}${task.isOverdue ? ' · overdue' : ''}`
}

/**
 * Splits a developer's tasks into live work and finished work.
 *
 * Both the feedback form and the daily update form offer completed tasks —
 * feedback is often written after the fact, and a day's work can be the day
 * something was finished — but neither should let finished work crowd out
 * what is live, so the two groups are rendered as separate `optgroup`s.
 *
 * Within each group `compareStatus` applies, which walks a task from
 * untouched to finished, and the name breaks ties so the list is stable
 * between renders.
 */
export function groupTasksByCompletion<TTask extends { name: string; status: TaskStatus }>(
  tasks: readonly TTask[],
): { completed: TTask[]; open: TTask[] } {
  const sorted = [...tasks].sort((left, right) => {
    const byStatus = compareStatus(left.status, right.status)
    return byStatus !== 0 ? byStatus : left.name.localeCompare(right.name)
  })

  return {
    completed: sorted.filter((task) => task.status === 'completed'),
    open: sorted.filter((task) => task.status !== 'completed'),
  }
}

export function sortByPriority<TEntry extends DailyWorkEntry>(
  entries: readonly TEntry[],
): TEntry[] {
  return [...entries].sort((left, right) => {
    const difference = PRIORITY_WEIGHT[left.priority] - PRIORITY_WEIGHT[right.priority]
    return difference !== 0 ? difference : right.date.localeCompare(left.date)
  })
}

/** Groups entries by a derived key, preserving input order within groups. */
export function groupBy<TValue, TKey extends string>(
  values: readonly TValue[],
  getKey: (value: TValue) => TKey,
): Map<TKey, TValue[]> {
  const groups = new Map<TKey, TValue[]>()

  for (const value of values) {
    const key = getKey(value)
    const existing = groups.get(key)
    if (existing === undefined) groups.set(key, [value])
    else existing.push(value)
  }

  return groups
}
