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

  /** Primary mentor, kept in step with the first id in mentorIds. */
  mentorId?: string

  /** Every mentor responsible for the project. Empty when nobody is. */
  mentorIds: readonly string[]

  assignedDeveloperIds: readonly string[]

  /** deletedAt is set by soft-delete under Supabase; lists filter these out. */
  deletedAt?: string
}

/** Create types omit deletedAt. */
export type CreateProjectRequest = Omit<Project, 'deletedAt' | 'id'>

export type UpdateProjectRequest = Partial<CreateProjectRequest>
