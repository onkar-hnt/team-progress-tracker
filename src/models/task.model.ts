import type { TaskPriority, TaskStatus } from './daily-work.model'

/**
 * A unit of work assigned to a developer, distinct from a daily update.
 *
 * A task is the *plan*: it is created by an admin, has a due date and lives
 * until it is finished. A `DailyWorkEntry` is the *record*: what a developer
 * did on one day. Keeping them apart means assigned work can be tracked as
 * overdue without inventing a daily entry for it.
 */
export interface AssignedTask {
  id: string
  name: string

  /**
   * The human-readable reference, `TSK001` and up.
   *
   * Display and export data, never a key. Issued by a database sequence
   * rather than generated here, so that two browsers creating a task at the
   * same moment cannot both claim TSK004.
   */
  code?: string

  description?: string

  projectId: string
  developerId: string
  /** Usually the developer's mentor; kept on the row so reassignment is auditable. */
  mentorId?: string

  priority: TaskPriority
  status: TaskStatus

  /** Calendar day as `yyyy-MM-dd`. */
  createdDate: string
  dueDate?: string

  /** Full ISO 8601 timestamp. */
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
  /** Inclusive upper bound on `dueDate`, for overdue and due-soon views. */
  dueOnOrBefore?: string
}
