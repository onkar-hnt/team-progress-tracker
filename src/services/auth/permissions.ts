import type { DailyWorkEntry } from '@models/index'
import type { AppUser } from '@models/user.model'

/**
 * Central permission rules.
 *
 * Every guard, button and route asks these functions rather than checking
 * `role === 'admin'` inline, so the policy can be read in one place and
 * changed without hunting through components.
 *
 * The agreed policy: the mentor is an admin with full access; developers can
 * see the whole team read-only, and may only create or change their own
 * entries.
 */

export function isAdmin(user: AppUser | null): boolean {
  return user?.role === 'admin'
}

/** Team-wide dashboards and reports are visible to everyone who signs in. */
export function canViewTeamData(user: AppUser | null): boolean {
  return user !== null
}

/** Managing developers and projects is reserved for the mentor. */
export function canManageTeam(user: AppUser | null): boolean {
  return isAdmin(user)
}

/**
 * Whether `user` may log or amend work on behalf of `developerId`.
 *
 * A developer account without a linked developer row cannot log work at all,
 * which is the correct outcome for a misconfigured account.
 */
export function canLogWorkFor(user: AppUser | null, developerId: string): boolean {
  if (user === null) return false
  if (isAdmin(user)) return true
  return user.developerId !== undefined && user.developerId === developerId
}

export function canEditEntry(user: AppUser | null, entry: DailyWorkEntry): boolean {
  return canLogWorkFor(user, entry.developerId)
}

export function canDeleteEntry(user: AppUser | null, entry: DailyWorkEntry): boolean {
  return canLogWorkFor(user, entry.developerId)
}

/** Whether the daily update form should be available at all. */
export function canSubmitDailyUpdate(user: AppUser | null): boolean {
  if (user === null) return false
  return isAdmin(user) || user.developerId !== undefined
}
