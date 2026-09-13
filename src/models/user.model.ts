export const USER_ROLES = ['admin', 'mentor', 'developer'] as const

export type UserRole = (typeof USER_ROLES)[number]

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  admin: 'Administrator',
  mentor: 'Mentor',
  developer: 'Developer',
}

export interface AppUser {
  email: string
  name: string
  role: UserRole
  developerId?: string
  mentorId?: string

  /** Blocks app use until a provisioned temporary password is replaced. */
  mustChangePassword?: boolean
}

export interface SignInCredentials {
  email: string
  password: string
}
