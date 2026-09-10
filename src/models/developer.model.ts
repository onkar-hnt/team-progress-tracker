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
  /** Job title, such as "Software Engineer". */
  role?: string
  location?: string
  active: boolean

  /** Work address, matched against the signed-in identity. */
  email?: string

  /** Access level. Absent rows are treated as developers. */
  accessRole?: UserRole
}

export type CreateDeveloperRequest = Omit<Developer, 'id'>

export type UpdateDeveloperRequest = Partial<CreateDeveloperRequest>
