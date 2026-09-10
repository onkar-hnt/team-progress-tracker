export const USER_ROLES = ['admin', 'developer'] as const

export type UserRole = (typeof USER_ROLES)[number]

/**
 * A signed-in person.
 *
 * `developerId` links the account to its `tblDevelopers` row, which is how a
 * developer's own entries are identified. The mentor signs in as an admin and
 * has no developer row, so the field is optional rather than a placeholder id.
 */
export interface AppUser {
  email: string
  name: string
  role: UserRole
  developerId?: string
}

export interface SignInCredentials {
  email: string
  password: string
}
