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

  updatedAt: string
}

export type CreateAssignedTaskRequest = Omit<AssignedTask, 'id' | 'updatedAt'>

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
