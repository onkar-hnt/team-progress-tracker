import type { AssignedTask, DailyWorkEntry, MentorComment } from '@models/index'
import type { AppUser } from '@models/user.model'

import type { AccessScope } from './access-scope'
import { canViewDeveloper } from './access-scope'

/**
 * Central permission rules.
 *
 * Every guard, button and route asks these functions rather than checking
 * `role === 'admin'` inline, so the policy can be read in one place and
 * changed without hunting through components.
 *
 * The agreed policy:
 * - Admin sees and manages everything.
 * - A mentor sees only the developers assigned to them, and their work,
 *   tasks and feedback. They may add feedback and update those tasks.
 * - A developer sees only their own records, and may only change their own.
 *
 * Visibility questions take an `AccessScope`, because "may I see this" always
 * depends on the mentor mapping, which is workbook data rather than a role.
 */

export function isAdmin(user: AppUser | null): boolean {
  return user?.role === 'admin'
}

export function isMentor(user: AppUser | null): boolean {
  return user?.role === 'mentor'
}

export function isDeveloper(user: AppUser | null): boolean {
  return user?.role === 'developer'
}

/** Managing employees, mentors, projects and mappings is admin-only. */
export function canManageTeam(user: AppUser | null): boolean {
  return isAdmin(user)
}

/** Only an admin creates and assigns tasks. */
export function canAssignTasks(user: AppUser | null): boolean {
  return isAdmin(user)
}

/** Mentors record feedback; an admin can too, on anyone's behalf. */
export function canWriteFeedback(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/**
 * Whether the person can see anybody other than themselves.
 *
 * Used to decide whether a screen offers team-wide views at all, rather than
 * showing a developer an empty developer list or a one-person filter.
 */
export function canViewTeamData(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/**
 * Whether `user` may log or amend work on behalf of `developerId`.
 *
 * A developer account without a linked employee row cannot log work at all,
 * which is the correct outcome for a misconfigured account. Mentors
 * deliberately cannot write work entries for their developers: a daily update
 * is a first-hand record, and letting somebody else author it would make the
 * history untrustworthy.
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

/**
 * Whether a task's status may be changed.
 *
 * The assignee updates their own progress, their mentor may update it on
 * their behalf after a conversation, and an admin may always. Nobody else can
 * touch a task, including other developers on the same project.
 */
export function canUpdateTaskStatus(
  user: AppUser | null,
  scope: AccessScope | null,
  task: AssignedTask,
): boolean {
  if (user === null || scope === null) return false
  if (isAdmin(user)) return true
  if (isMentor(user)) return canViewDeveloper(scope, task.developerId)
  return user.developerId === task.developerId
}

/** Only the author of a comment, or an admin, may change it. */
export function canEditComment(user: AppUser | null, comment: MentorComment): boolean {
  if (user === null) return false
  if (isAdmin(user)) return true
  return isMentor(user) && user.mentorId === comment.mentorId
}

/**
 * Whether a developer's own profile page may be opened.
 *
 * This is what stops a developer reaching a colleague's page by editing the
 * URL: the route reads the id from the path and asks this before rendering.
 */
export function canViewDeveloperProfile(
  scope: AccessScope | null,
  developerId: string,
): boolean {
  return scope !== null && canViewDeveloper(scope, developerId)
}
