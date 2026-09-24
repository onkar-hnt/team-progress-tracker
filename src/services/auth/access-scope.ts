import type { AppUser, MentorAssignment } from '@models/index'

import { isAdmin } from './permissions'

export interface AccessScope {
  role: AppUser['role']

  /** The person's own employee row, when they have one. */
  developerId?: string

  /** The person's own mentor row, when they have one. */
  mentorId?: string

  visibleDeveloperIds: readonly string[] | null

  /**
   * Projects whose work this person may see for developers other than themselves.
   * Null means every project: administrators, and developers reading their own work.
   */
  visibleProjectIds: readonly string[] | null

  readsRoster: boolean
}

export function buildAccessScope(
  user: AppUser | null,
  assignments: readonly MentorAssignment[],
  responsibleProjectIds: readonly string[] = [],
): AccessScope | null {
  if (user === null) return null

  const base = {
    role: user.role,
    readsRoster: isAdmin(user) || user.role === 'mentor',
    ...(user.developerId === undefined ? {} : { developerId: user.developerId }),
    ...(user.mentorId === undefined ? {} : { mentorId: user.mentorId }),
  }

  if (isAdmin(user)) {
    return { ...base, visibleDeveloperIds: null, visibleProjectIds: null }
  }

  if (user.role === 'mentor') {
    const assigned = assignments
      .filter(
        (assignment) => assignment.mentorId === user.mentorId && (assignment.active ?? true),
      )
      .map((assignment) => assignment.developerId)

    const own = user.developerId === undefined ? [] : [user.developerId]
    return {
      ...base,
      visibleDeveloperIds: [...new Set([...assigned, ...own])],
      visibleProjectIds: [...new Set(responsibleProjectIds)],
    }
  }

  return {
    ...base,
    visibleDeveloperIds: user.developerId === undefined ? [] : [user.developerId],
    visibleProjectIds: null,
  }
}

/** Active mentors assigned to one developer, without duplicate ids. */
export function assignedMentorIds(
  assignments: readonly MentorAssignment[],
  developerId: string,
): string[] {
  return [
    ...new Set(
      assignments
        .filter(
          (assignment) =>
            assignment.developerId === developerId && (assignment.active ?? true),
        )
        .map((assignment) => assignment.mentorId),
    ),
  ]
}

export function isUnrestricted(scope: AccessScope): boolean {
  return scope.visibleDeveloperIds === null
}

export function describeScope(scope: AccessScope): string {
  const visible =
    scope.visibleDeveloperIds === null ? 'all' : [...scope.visibleDeveloperIds].sort().join(',')
  const projects =
    scope.visibleProjectIds === null ? 'all-projects' : [...scope.visibleProjectIds].sort().join(',')

  return `${scope.role}:${scope.developerId ?? '-'}:${visible}:${projects}`
}

export function canViewDeveloper(scope: AccessScope, developerId: string): boolean {
  return scope.visibleDeveloperIds === null || scope.visibleDeveloperIds.includes(developerId)
}

export function canViewProject(scope: AccessScope, projectId: string): boolean {
  return scope.visibleProjectIds === null || scope.visibleProjectIds.includes(projectId)
}

/**
 * Whether this person may see one developer's work on one project.
 *
 * A missing project id is not another project's data: general feedback stays
 * with every mentor assigned to the developer. A person's own rows are not
 * limited by the projects they mentor.
 */
export function canViewDeveloperProject(
  scope: AccessScope,
  developerId: string,
  projectId?: string,
): boolean {
  if (!canViewDeveloper(scope, developerId)) return false
  if (scope.developerId === developerId) return true
  if (projectId === undefined || scope.visibleProjectIds === null) return true
  return scope.visibleProjectIds.includes(projectId)
}

export function restrictDeveloperIds(
  scope: AccessScope,
  requested?: readonly string[],
): readonly string[] | undefined {
  if (scope.visibleDeveloperIds === null) return requested

  if (requested === undefined) return scope.visibleDeveloperIds
  return requested.filter((id) => scope.visibleDeveloperIds?.includes(id) ?? false)
}

/**
 * Narrows a requested project list to the projects this mentor is responsible for.
 * An open request becomes that list. Administrators and developers are unchanged.
 */
export function restrictProjectIds(
  scope: AccessScope,
  requested?: readonly string[],
): readonly string[] | undefined {
  if (scope.visibleProjectIds === null) return requested

  if (requested === undefined) return scope.visibleProjectIds
  return requested.filter((id) => scope.visibleProjectIds?.includes(id) ?? false)
}

/** Keeps only the records this scope may see, including by project when the row has one. */
export function filterByScope<TRecord extends { developerId: string; projectId?: string }>(
  scope: AccessScope,
  records: readonly TRecord[],
): TRecord[] {
  if (scope.visibleDeveloperIds === null && scope.visibleProjectIds === null) return [...records]
  return records.filter((record) =>
    canViewDeveloperProject(scope, record.developerId, record.projectId),
  )
}
