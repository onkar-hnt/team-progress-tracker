import type { UserRole } from './user.model'

/**
 * A team member: the Employees table of the workbook.
 *
 * `id` mirrors the `DeveloperId` column in `tblDevelopers` and is the only
 * valid relational key. Names are display data and must never be used to join
 * records.
 *
 * `email` and `accessRole` make this table the source of truth for who may
 * sign in and what they may see, so no account or role is held in code.
 * `role` is unrelated: it is the person's job title.
 */
export interface Developer {
  id: string
  name: string

  /**
   * The human-readable reference, `DEV001` and up.
   *
   * Display and export data, never a key, and distinct from `employeeId`:
   * this one is issued by this application, that one comes from HR.
   *
   * Optional because only a backend that issues codes populates it. It is
   * not generated here — two browsers counting rows would both decide the
   * next employee is DEV004 — but by a database sequence, which cannot
   * collide.
   */
  code?: string

  /**
   * Payroll or HR reference.
   *
   * Kept separate from `id` so that the relational key stays under this
   * application's control even if HR renumbers people.
   */
  employeeId?: string

  /** Job title, such as "Software Engineer". */
  role?: string
  location?: string
  active: boolean

  /** Work address, matched against the signed-in identity. */
  email?: string

  /** Access level. Absent rows are treated as developers. */
  accessRole?: UserRole

  /**
   * Primary project.
   *
   * A convenience for reporting; the authoritative assignment list is
   * `AssignedDevelopers` on each project, since people work on several.
   */
  primaryProjectId?: string

  /** ISO date the record was added. */
  createdDate?: string
}

export type CreateDeveloperRequest = Omit<Developer, 'id'>

export type UpdateDeveloperRequest = Partial<CreateDeveloperRequest>
