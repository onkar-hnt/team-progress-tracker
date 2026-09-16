import type { TaskPriority, TaskStatus } from './daily-work.model'

export interface AssignedTask {
  id: string
  name: string

  /** code is assigned by the database sequence, not generated client-side. */
  code?: string

  description?: string

  projectId: string
  developerId: string
  mentorId?: string

  priority: TaskPriority
  status: TaskStatus

  createdDate: string
  dueDate?: string

  /** Hours the whole task is expected to take. Absent until somebody estimates it. */
  estimatedHours?: number

  /** Distinct days carrying a daily update for this task. Counted by the database. */
  workedDays: number

  /** Those days at a standard working day, for comparison with the estimate. */
  actualHours: number

  updatedAt: string
}

export type CreateAssignedTaskRequest = Omit<
  AssignedTask,
  'actualHours' | 'id' | 'updatedAt' | 'workedDays'
>

export type UpdateAssignedTaskRequest = Partial<CreateAssignedTaskRequest>

export interface AssignedTaskQuery {
  developerIds?: readonly string[]
  mentorIds?: readonly string[]
  projectIds?: readonly string[]
  statuses?: readonly TaskStatus[]
  priorities?: readonly TaskPriority[]
  dueOnOrBefore?: string

  /** Limit implies most recently updated first. */
  limit?: number
}
