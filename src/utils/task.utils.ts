import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@constants/task.constants'
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
