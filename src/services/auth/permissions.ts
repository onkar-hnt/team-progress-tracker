import type { AssignedTask, DailyWorkEntry, MentorComment } from '@models/index'
import type { AppUser, UserRole } from '@models/user.model'

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
 *   for the developers assigned to them. They maintain that assignment list
 *   themselves, and so can widen their own reach by claiming an employee; what
 *   stays withheld is changing anybody's role or account status, and touching
 *   another mentor's assignments.
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
 * Editing the developers assigned to one mentor.
 *
 * An admin maintains anybody's list. A mentor maintains their own and no other,
 * which is why this asks about a particular mentor rather than about the person
 * signed in — the same question has different answers row by row on the Mentors
 * screen.
 *
 * A mentor adding to their own list does widen what they can see: this mapping
 * is what `can_view_developer()` reads, so claiming an employee grants sight of
 * that employee's work and feedback. That is the accepted trade rather than an
 * oversight, and it is bounded in the database rather than here — the
 * `mentor_assignments` policies pin a mentor's writes to rows naming
 * themselves, so a mentor cannot edit a colleague's list even by calling
 * PostgREST directly.
 */
export function canManageMentorAssignments(user: AppUser | null, mentorId: string): boolean {
  if (user === null) return false
  if (isAdmin(user)) return true
  return isMentor(user) && user.mentorId === mentorId
}

/**
 * Whether the Profile screen offers to manage anybody else's password.
 *
 * Admins and mentors, which is not the same as saying they may reset any
 * particular person — see `canResetPasswordFor`. This answers only whether the
 * panel is worth drawing at all.
 */
export function canManagePasswords(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/**
 * Somebody whose password could be reset, as much of them as the decision needs.
 *
 * `id` is the business row — `developers.id` or `mentors.id` — and never a
 * profile id, matching what the Edge Function accepts.
 */
export interface PasswordResetTarget {
  kind: 'developer' | 'mentor'

  id: string

  /** Absent when there is no login yet, and so no password to reset. */
  profileId?: string

  /** The access role on their profile, where the record carries it. */
  accessRole?: UserRole

  /**
   * Whether this developer also holds a mentor record.
   *
   * One person can be both. The database refuses a mentor against anybody with a
   * mentor record whatever their profile role says, so the interface has to know
   * the same thing or it would offer a button the server declines.
   */
  isAlsoMentor?: boolean
}

/**
 * Whether `user` may set the password of one particular person.
 *
 * The mirror of `public.may_reset_password`, which is the authority: this decides
 * what to draw, that decides what happens. Both are written out in full rather
 * than one deriving from the other, because they answer at different moments —
 * this one against a list already on screen, that one against the database at the
 * instant of the write.
 *
 * An admin may reset any developer or mentor. A mentor may reset a developer
 * assigned to them, and only somebody who is a developer and nothing else.
 * Nobody resets an administrator, and nobody resets themselves from here: your
 * own password is changed on the password screen, which proves the session
 * belongs to you rather than proving anything about a role.
 */
export function canResetPasswordFor(
  user: AppUser | null,
  scope: AccessScope | null,
  target: PasswordResetTarget,
): boolean {
  // No login, nothing to reset. That person needs Create login, which issues a
  // password of its own — a separate act, on a separate screen.
  if (target.profileId === undefined) return false

  return isPasswordResetCandidate(user, scope, target)
}

/**
 * The same question, leaving aside whether a login exists yet.
 *
 * Split out so a screen can list everybody it is responsible for and say why two
 * of them have no Reset control, rather than silently omitting them and leaving a
 * mentor wondering where somebody went. Only `canResetPasswordFor` decides
 * whether the control is offered.
 */
export function isPasswordResetCandidate(
  user: AppUser | null,
  scope: AccessScope | null,
  target: PasswordResetTarget,
): boolean {
  if (user === null) return false

  if (target.accessRole === 'admin') return false

  // Yourself, by whichever record you are looking at. `AppUser` carries the two
  // business ids rather than a profile id, and comparing those is the same
  // question the database asks of the profiles behind them.
  const isSelf =
    target.kind === 'developer' ? target.id === user.developerId : target.id === user.mentorId

  if (isSelf) return false

  if (isAdmin(user)) return true
  if (!isMentor(user)) return false

  // Somebody who is a developer and nothing else, by all three of the things
  // that can say otherwise: the record they are listed through, a mentor record
  // under the same login, and the access role on their profile — which is what
  // the database compares, so a developer row carrying `mentor` there is one this
  // would otherwise offer and the server would refuse.
  if (target.kind !== 'developer') return false
  if (target.isAlsoMentor === true) return false
  if (target.accessRole !== undefined && target.accessRole !== 'developer') return false

  return scope !== null && canViewDeveloper(scope, target.id)
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
 * Whether this person can delete anything at all.
 *
 * An observation about the screens rather than a rule of its own, which is why it is
 * worth stating in one place: every delete in the application — a work entry, a task,
 * feedback, an employee, a mentor, a project — is offered on a screen only an
 * administrator or a mentor can reach. A developer's own screens have Edit and a status
 * control and no Delete anywhere.
 *
 * So a developer's Recently deleted could only ever be empty, and a bin that can never
 * fill is worse than no bin: it invites somebody to look for something that was never
 * put there. This is what hides the link for them.
 *
 * It decides what to offer and not what is permitted. The UPDATE policies still let a
 * developer restore their own deleted work entry, which matters in the one case where
 * somebody else deleted it — the route stays reachable for that reason, it is just no
 * longer advertised to people with nothing to find behind it.
 */
export function canDeleteRecords(user: AppUser | null): boolean {
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
