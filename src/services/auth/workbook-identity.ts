import type { AppUser, UserRole } from '@models/user.model'
import type { DataProvider } from '@services/data-provider/data-provider.interface'

import { bootstrapAdmin, bootstrapAdminUser, isBootstrapAdminEmail } from './bootstrap-admin'

/**
 * Resolves who a person is, and what they may do, from the workbook.
 *
 * This is the piece that keeps accounts out of the codebase: the Employees
 * table decides who exists and what access they have, and the Mentors table
 * decides whose developers they can see. Granting somebody admin is an edit
 * to a spreadsheet cell, not a release.
 */

const PASSWORD_SUFFIX = '@1234'

export interface WorkbookIdentity {
  user: AppUser
  /**
   * The password this account is expected to use.
   *
   * Only meaningful for the fallback sign-in used before single sign-on is
   * configured. It is derived from the person's name by the agreed
   * `FirstName@1234` convention rather than stored anywhere, which is also why
   * it offers no real protection.
   */
  expectedPassword: string
}

/**
 * Looks an email address up across the Employees and Mentors tables.
 *
 * Returns `null` when the address is unknown or the row is inactive, which is
 * how access is revoked: remove the row, blank the email, or set `Active` to
 * `No` in Excel.
 */
export async function resolveWorkbookIdentity(
  provider: DataProvider,
  email: string,
): Promise<WorkbookIdentity | null> {
  const normalised = email.trim().toLowerCase()
  if (normalised === '') return null

  // Resolved before the workbook is read, so the administrator can still sign
  // in when it is empty, unreachable or malformed — which is precisely when
  // somebody needs to get in and fix it.
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

  // An inactive row keeps its history but loses access. A mentor row alone is
  // enough to sign in, so a mentor need not be an employee.
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

/**
 * The Employees `AccessRole` column wins where it is set.
 *
 * Otherwise a row in the Mentors table implies the mentor role, and anything
 * else is a developer. Defaulting to the least privilege means a blank or
 * mistyped cell cannot accidentally grant access.
 */
function resolveRole(accessRole: UserRole | undefined, isMentor: boolean): UserRole {
  if (accessRole !== undefined) return accessRole
  return isMentor ? 'mentor' : 'developer'
}

export function expectedPasswordFor(name: string): string {
  const firstName = name.trim().split(/\s+/)[0] ?? name
  return `${firstName}${PASSWORD_SUFFIX}`
}
