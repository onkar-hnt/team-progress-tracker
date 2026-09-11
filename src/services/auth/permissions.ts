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
 * - A mentor manages the roster alongside the admin — employees, mentors,
 *   projects, tasks and logins — but still sees work, feedback and tasks only
 *   for the developers assigned to them. Two powers are withheld, because
 *   granting them would let a mentor widen their own reach: changing anybody's
 *   role or account status, and editing the mentor assignments that define
 *   whose work they can see.
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

/** Maintaining employees, mentors and projects: admins and mentors. */
export function canManageTeam(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/**
 * Assigning tasks: admins, and mentors to their own developers.
 *
 * This answers "may this person reach the Tasks screen". Which developers they
 * may assign to is a separate question, settled by the access scope — and by
 * `tasks_insert`, which refuses a mentor assigning outside it.
 */
export function canAssignTasks(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/**
 * Editing the mentor mapping: admin only, and deliberately so.
 *
 * A mentor's reach is defined by this mapping, so a mentor who could edit it
 * could grant themselves every developer's work and feedback. Withholding it
 * is what keeps the rest of a mentor's narrowing meaningful rather than
 * nominal, and it is enforced by the `mentor_assignments` policies too.
 */
export function canManageMentorAssignments(user: AppUser | null): boolean {
  return isAdmin(user)
}

/** Mentors record feedback; an admin can too, on anyone's behalf. */
export function canWriteFeedback(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/**
 * Whether the Feedback screen may be opened at all.
 *
 * Wider than `canWriteFeedback`, because feedback is written for somebody to
 * read: the developer it is about sees it on the same screen, without the
 * form or the edit controls. The database was built for this — `mentors_select`
 * exists so that a developer can resolve the name of the mentor who wrote it.
 *
 * A developer account with no linked employee row has no feedback to read,
 * which is the correct outcome for a misconfigured account.
 */
export function canReadFeedback(user: AppUser | null): boolean {
  if (user === null) return false
  return canWriteFeedback(user) || user.developerId !== undefined
}

/**
 * Whether the source workbook may be opened directly.
 *
 * Restricted to the people who maintain it. A developer opening the raw file
 * would see every colleague's records, which is exactly what the rest of the
 * application prevents, so the link is not offered to them.
 */
export function canOpenWorkbook(user: AppUser | null): boolean {
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
