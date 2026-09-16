export const PROJECT_STATUSES = ['planned', 'active', 'on-hold', 'completed'] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export interface Project {
  id: string
  name: string
  client?: string
  active: boolean

  /** code is assigned by the database sequence, not generated client-side. */
  code?: string

  description?: string
  status: ProjectStatus

  startDate?: string
  endDate?: string

  mentorId?: string

  assignedDeveloperIds: readonly string[]

  /** deletedAt is set by the server on soft-delete; lists exclude these rows. */
  deletedAt?: string
}

/** Create types omit deletedAt. */
export type CreateProjectRequest = Omit<Project, 'deletedAt' | 'id'>

export type UpdateProjectRequest = Partial<CreateProjectRequest>
