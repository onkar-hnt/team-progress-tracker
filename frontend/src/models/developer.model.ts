import type { UserRole } from './user.model'

export interface Developer {
  id: string
  name: string

  /** code is assigned by the database sequence, not generated client-side. */
  code?: string

  employeeId?: string

  role?: string
  location?: string
  active: boolean

  email?: string

  accessRole?: UserRole

  /** profileId is set by provisioning only, never by client writes. */
  profileId?: string

  primaryProjectId?: string

  createdDate?: string

  /** deletedAt is set by the server on soft-delete; lists exclude these rows. */
  deletedAt?: string
}

/** Create types omit deletedAt and profileId. */
export type CreateDeveloperRequest = Omit<Developer, 'deletedAt' | 'id'>

export type UpdateDeveloperRequest = Partial<CreateDeveloperRequest>
