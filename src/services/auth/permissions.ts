import type { AssignedTask, DailyWorkEntry, MentorComment } from '@models/index'
import type { AppUser, UserRole } from '@models/user.model'

import type { AccessScope } from './access-scope'
import { canViewDeveloper } from './access-scope'

export function isAdmin(user: AppUser | null): boolean {
  return user?.role === 'admin'
}

export function isMentor(user: AppUser | null): boolean {
  return user?.role === 'mentor'
}

export function isDeveloper(user: AppUser | null): boolean {
  return user?.role === 'developer'
}

export function canManageTeam(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

export function canAssignTasks(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/** Mentors may edit only their own assignment list; DB policies enforce writes. */
export function canManageMentorAssignments(user: AppUser | null, mentorId: string): boolean {
  if (user === null) return false
  if (isAdmin(user)) return true
  return isMentor(user) && user.mentorId === mentorId
}

export function canManagePasswords(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

export interface PasswordResetTarget {
  kind: 'developer' | 'mentor'

  id: string

  profileId?: string

  accessRole?: UserRole

  /** DB refuses mentor reset when the person also has a mentor record. */
  isAlsoMentor?: boolean
}

/** Mirrors may_reset_password for UI; the database is the authority on write. */
export function canResetPasswordFor(
  user: AppUser | null,
  scope: AccessScope | null,
  target: PasswordResetTarget,
): boolean {
  if (target.profileId === undefined) return false

  return isPasswordResetCandidate(user, scope, target)
}

export function isPasswordResetCandidate(
  user: AppUser | null,
  scope: AccessScope | null,
  target: PasswordResetTarget,
): boolean {
  if (user === null) return false

  if (target.accessRole === 'admin') return false

  const isSelf =
    target.kind === 'developer' ? target.id === user.developerId : target.id === user.mentorId

  if (isSelf) return false

  if (isAdmin(user)) return true
  if (!isMentor(user)) return false

  if (target.kind !== 'developer') return false
  if (target.isAlsoMentor === true) return false
  if (target.accessRole !== undefined && target.accessRole !== 'developer') return false

  return scope !== null && canViewDeveloper(scope, target.id)
}

export function canWriteFeedback(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/** Developers read feedback on the same screen; mentors_select resolves author names. */
export function canReadFeedback(user: AppUser | null): boolean {
  if (user === null) return false
  return canWriteFeedback(user) || user.developerId !== undefined
}

export function canOpenWorkbook(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

export function canViewTeamData(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/** Hides bin nav for developers; UPDATE policies still allow restoring own deleted entries. */
export function canDeleteRecords(user: AppUser | null): boolean {
  return isAdmin(user) || isMentor(user)
}

/** Mentors cannot log daily work for developers; only the assignee or admin may. */
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

export function canSubmitDailyUpdate(user: AppUser | null): boolean {
  if (user === null) return false
  return isAdmin(user) || user.developerId !== undefined
}

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

export function canEditComment(user: AppUser | null, comment: MentorComment): boolean {
  if (user === null) return false
  if (isAdmin(user)) return true
  return isMentor(user) && user.mentorId === comment.mentorId
}

/** Blocks opening a colleague profile by editing the route id. */
export function canViewDeveloperProfile(
  scope: AccessScope | null,
  developerId: string,
): boolean {
  return scope !== null && canViewDeveloper(scope, developerId)
}
