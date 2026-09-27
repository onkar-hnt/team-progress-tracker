import {
  PROGRESS_MAX,
  PROGRESS_MIN,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '@constants/task.constants'
import type { DailyWorkEntry, TaskPriority, TaskStatus } from '@models/index'

/** Blocked when status is blocked or IsBlocked is set. */
export function isEntryBlocked(entry: DailyWorkEntry): boolean {
  return entry.isBlocked || entry.status === 'blocked'
}

export function isEntryCompleted(entry: DailyWorkEntry): boolean {
  return entry.status === 'completed'
}

/** Implied progress for a status, or null when any value is valid. */
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

export function sortByMostRecent<TEntry extends DailyWorkEntry>(
  entries: readonly TEntry[],
): TEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) return right.date.localeCompare(left.date)
    return right.updatedAt.localeCompare(left.updatedAt)
  })
}

const PRIORITY_WEIGHT: Readonly<Record<TaskPriority, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const STATUS_WEIGHT: Readonly<Record<TaskStatus, number>> = {
  'not-started': 0,
  'in-progress': 1,
  blocked: 2,
  completed: 3,
}

export function comparePriority(left: TaskPriority, right: TaskPriority): number {
  return PRIORITY_WEIGHT[left] - PRIORITY_WEIGHT[right]
}

export function compareStatus(left: TaskStatus, right: TaskStatus): number {
  return STATUS_WEIGHT[left] - STATUS_WEIGHT[right]
}

/** How many trail entries each task carries, for the list indicator. */
export function countCommentsByTask(
  comments: readonly { taskId?: string }[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()

  for (const comment of comments) {
    if (comment.taskId === undefined) continue
    counts.set(comment.taskId, (counts.get(comment.taskId) ?? 0) + 1)
  }

  return counts
}

/** Hours in a working day, matching standard_working_hours() in the database. */
export const STANDARD_WORKING_HOURS = 8

export type EffortVerdict = 'on' | 'over' | 'under'

export interface EffortComparison {
  verdict: EffortVerdict

  /** Hours between the estimate and the time taken, never negative. */
  differenceHours: number
}

/**
 * How the time taken compares with the estimate, or null when there is nothing
 * to compare: no estimate given, or no day logged against the task yet.
 */
export function compareEffort(task: {
  estimatedHours?: number
  actualHours: number
  workedDays: number
}): EffortComparison | null {
  if (task.estimatedHours === undefined || task.workedDays === 0) return null

  const difference = task.actualHours - task.estimatedHours

  return {
    verdict: difference === 0 ? 'on' : difference > 0 ? 'over' : 'under',
    differenceHours: Math.abs(difference),
  }
}

export function describeEffort(comparison: EffortComparison): string {
  const hours = `${String(Number(comparison.differenceHours.toFixed(2)))} h`

  if (comparison.verdict === 'on') return 'On estimate'

  return comparison.verdict === 'over' ? `${hours} over estimate` : `${hours} under estimate`
}

export interface TaskOption {
  id: string
  name: string
  status: TaskStatus
  projectName: string
  isOverdue: boolean
}

export function describeTask(task: TaskOption): string {
  return `${task.name} · ${task.projectName}${task.isOverdue ? ' · overdue' : ''}`
}

/** Split tasks into open and completed optgroups for pickers. */
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
