import type { AppUser, UserRole } from '@models/user.model'
import type { DataProvider } from '@services/data-provider/data-provider.interface'

import { bootstrapAdmin, bootstrapAdminUser, isBootstrapAdminEmail } from './bootstrap-admin'

const PASSWORD_SUFFIX = '@1234'

export interface WorkbookIdentity {
  user: AppUser
  expectedPassword: string
}

export async function resolveWorkbookIdentity(
  provider: DataProvider,
  email: string,
): Promise<WorkbookIdentity | null> {
  const normalised = email.trim().toLowerCase()
  if (normalised === '') return null

  if (isBootstrapAdminEmail(normalised)) {
    return { user: bootstrapAdminUser(), expectedPassword: bootstrapAdmin.password }
  }

  const [developers, mentors] = await Promise.all([
    provider.getDevelopers(),
    provider.getMentors(),
  ])

  const employee = developers.find(
    (developer) => developer.email?.toLowerCase() === normalised,
  )
  const mentor = mentors.find((candidate) => candidate.email.toLowerCase() === normalised)

  if (employee === undefined && mentor === undefined) return null

  if (employee !== undefined && !employee.active && mentor === undefined) return null
  if (mentor !== undefined && !mentor.active && employee === undefined) return null

  const name = employee?.name ?? mentor?.name ?? normalised
  const role = resolveRole(employee?.accessRole, mentor !== undefined)

  const user: AppUser = {
    email: normalised,
    name,
    role,
    ...(employee === undefined ? {} : { developerId: employee.id }),
    ...(mentor === undefined ? {} : { mentorId: mentor.id }),
  }

  return { user, expectedPassword: expectedPasswordFor(name) }
}

function resolveRole(accessRole: UserRole | undefined, isMentor: boolean): UserRole {
  if (accessRole !== undefined) return accessRole
  return isMentor ? 'mentor' : 'developer'
}

export function expectedPasswordFor(name: string): string {
  const firstName = name.trim().split(/\s+/)[0] ?? name
  return `${firstName}${PASSWORD_SUFFIX}`
}
