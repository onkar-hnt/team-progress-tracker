export const TASK_STATUSES = ['not-started', 'in-progress', 'completed', 'blocked'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export interface DailyWorkEntry {
  id: string
  date: string
  developerId: string
  projectId: string

  /** When present, task status and entry status are kept in step by the database. */
  taskId?: string

  taskTitle: string
  description?: string
  workDone?: string
  plannedWork?: string

  status: TaskStatus
  priority: TaskPriority

  progress: number
  hoursSpent?: number

  /** What the whole task is expected to take, as judged on this day. */
  estimatedHours?: number

  isBlocked: boolean
  blockerDescription?: string

  remarks?: string

  createdAt: string
  updatedAt: string
}

export type CreateDailyWorkEntryRequest = Omit<DailyWorkEntry, 'createdAt' | 'id' | 'updatedAt'>

export type UpdateDailyWorkEntryRequest = Partial<CreateDailyWorkEntryRequest>

export interface DailyWorkQuery {
  dateFrom?: string
  dateTo?: string
  developerIds?: readonly string[]
  projectIds?: readonly string[]
  statuses?: readonly TaskStatus[]
  priorities?: readonly TaskPriority[]
  isBlocked?: boolean

  /** Limit implies newest-first order (date, then id). */
  limit?: number
}
