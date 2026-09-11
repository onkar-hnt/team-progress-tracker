export const USER_ROLES = ['admin', 'mentor', 'developer'] as const

export type UserRole = (typeof USER_ROLES)[number]

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  admin: 'Administrator',
  mentor: 'Mentor',
  developer: 'Developer',
}

/**
 * A signed-in person.
 *
 * The role and both ids are resolved from the workbook after sign-in, never
 * from the code: `developerId` links to the employee row that owns a person's
 * work, and `mentorId` to the mentor row that owns their assignments. A
 * mentor who also logs work has both.
 */
export interface AppUser {
  email: string
  name: string
  role: UserRole
  developerId?: string
  mentorId?: string

  /**
   * Set while the person is still using the password they were handed.
   *
   * Accounts provisioned from the Employees screen start with a password
   * derived from the holder's name, which is guessable by anyone who knows
   * the rule. The flag is what stops that temporary password becoming a
   * permanent one: every screen stays out of reach until it is replaced.
   */
  mustChangePassword?: boolean
}

export interface SignInCredentials {
  email: string
  password: string
}
