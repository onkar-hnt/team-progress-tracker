export const PROJECT_STATUSES = ['planned', 'active', 'on-hold', 'completed'] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/**
 * A project that work is logged and assigned against.
 *
 * `id` mirrors the `ProjectId` column in `tblProjects`. Projects are
 * configuration data owned by the workbook, not by the application.
 *
 * `active` and `status` are deliberately separate: `status` is where the
 * project stands in its life cycle, while `active` controls whether it is
 * still offered in dropdowns. A completed project stays selectable for a
 * while so late entries can still be logged against it.
 */
export interface Project {
  id: string
  name: string
  client?: string
  active: boolean

  /**
   * The human-readable reference, `PRJ001` and up.
   *
   * Display and export data, never a key. Issued by a database sequence
   * rather than generated here, because two browsers counting rows would
   * both decide the next project is PRJ004.
   */
  code?: string

  description?: string
  status: ProjectStatus

  /** Calendar days as `yyyy-MM-dd`. */
  startDate?: string
  endDate?: string

  /** Mentor accountable for the project, if any. */
  mentorId?: string

  /**
   * Developers assigned to the project.
   *
   * Stored in a single workbook cell as a delimited list of `DeveloperId`
   * values. A join table would be cleaner, but the assignment is always read
   * and written as a whole set, and one column keeps the sheet editable by
   * hand.
   */
  assignedDeveloperIds: readonly string[]
}

export type CreateProjectRequest = Omit<Project, 'id'>

export type UpdateProjectRequest = Partial<CreateProjectRequest>
