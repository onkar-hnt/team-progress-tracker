export const TASK_STATUSES = ['not-started', 'in-progress', 'completed', 'blocked'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/**
 * A single task update logged by a developer for a given day.
 *
 * One developer may log several entries for the same date, so `date` is not
 * unique and must never be treated as a key. `id` (the `EntryId` column) is
 * the only stable identifier.
 */
export interface DailyWorkEntry {
  id: string
  /** Calendar day the work applies to, as `yyyy-MM-dd`. */
  date: string
  developerId: string
  projectId: string

  taskTitle: string
  description?: string

  status: TaskStatus
  priority: TaskPriority

  /** Whole percentage between 0 and 100. */
  progress: number
  hoursSpent?: number

  isBlocked: boolean
  blockerDescription?: string

  remarks?: string

  /** Full ISO 8601 timestamp. */
  createdAt: string
  /** Full ISO 8601 timestamp. */
  updatedAt: string
}

/**
 * Fields a developer supplies when logging work. Identity and audit
 * timestamps are assigned by the data provider so that every storage backend
 * stays authoritative over them.
 */
export type CreateDailyWorkEntryRequest = Omit<DailyWorkEntry, 'createdAt' | 'id' | 'updatedAt'>

/** Partial update of an existing entry, addressed separately by `id`. */
export type UpdateDailyWorkEntryRequest = Partial<CreateDailyWorkEntryRequest>

/**
 * Server-agnostic filter passed to the data layer.
 *
 * Providers may satisfy these filters remotely or in memory; callers must not
 * depend on which. Date bounds are inclusive `yyyy-MM-dd` strings.
 */
export interface DailyWorkQuery {
  dateFrom?: string
  dateTo?: string
  developerIds?: readonly string[]
  projectIds?: readonly string[]
  statuses?: readonly TaskStatus[]
  priorities?: readonly TaskPriority[]
  isBlocked?: boolean
}
