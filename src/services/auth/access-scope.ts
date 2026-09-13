import type { AppUser, MentorAssignment } from '@models/index'

import { isAdmin } from './permissions'

export interface AccessScope {
  role: AppUser['role']

  /** The person's own employee row, when they have one. */
  developerId?: string

  /** The person's own mentor row, when they have one. */
  mentorId?: string

  visibleDeveloperIds: readonly string[] | null

  readsRoster: boolean
}

export function buildAccessScope(
  user: AppUser | null,
  assignments: readonly MentorAssignment[],
): AccessScope | null {
  if (user === null) return null

  const base = {
    role: user.role,
    readsRoster: isAdmin(user) || user.role === 'mentor',
    ...(user.developerId === undefined ? {} : { developerId: user.developerId }),
    ...(user.mentorId === undefined ? {} : { mentorId: user.mentorId }),
  }

  if (isAdmin(user)) return { ...base, visibleDeveloperIds: null }

  if (user.role === 'mentor') {
    const assigned = assignments
      .filter(
        (assignment) => assignment.mentorId === user.mentorId && (assignment.active ?? true),
      )
      .map((assignment) => assignment.developerId)

    const own = user.developerId === undefined ? [] : [user.developerId]
    return { ...base, visibleDeveloperIds: [...new Set([...assigned, ...own])] }
  }

  return {
    ...base,
    visibleDeveloperIds: user.developerId === undefined ? [] : [user.developerId],
  }
}

export function isUnrestricted(scope: AccessScope): boolean {
  return scope.visibleDeveloperIds === null
}

export function describeScope(scope: AccessScope): string {
  const visible =
    scope.visibleDeveloperIds === null ? 'all' : [...scope.visibleDeveloperIds].sort().join(',')

  return `${scope.role}:${scope.developerId ?? '-'}:${visible}`
}

export function canViewDeveloper(scope: AccessScope, developerId: string): boolean {
  return scope.visibleDeveloperIds === null || scope.visibleDeveloperIds.includes(developerId)
}

export function restrictDeveloperIds(
  scope: AccessScope,
  requested?: readonly string[],
): readonly string[] | undefined {
  if (scope.visibleDeveloperIds === null) return requested

  if (requested === undefined) return scope.visibleDeveloperIds
  return requested.filter((id) => scope.visibleDeveloperIds?.includes(id) ?? false)
}

/** Keeps only the records belonging to employees in scope. */
export function filterByScope<TRecord extends { developerId: string }>(
  scope: AccessScope,
  records: readonly TRecord[],
): TRecord[] {
  if (scope.visibleDeveloperIds === null) return [...records]
  return records.filter((record) => canViewDeveloper(scope, record.developerId))
}
