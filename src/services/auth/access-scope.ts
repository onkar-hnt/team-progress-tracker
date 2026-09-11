import type { AppUser, MentorAssignment } from '@models/index'

import { isAdmin } from './permissions'

/**
 * The set of records a signed-in person may see.
 *
 * Every data hook narrows its query through this object, so isolation is
 * decided once here rather than remembered separately on each screen. A new
 * screen that forgets to filter cannot leak data, because the hooks it calls
 * cannot return anything outside the scope.
 *
 * SECURITY: this is enforced in the browser. It reliably prevents the UI from
 * displaying another person's data — including by editing a URL, a filter or
 * a query cache — but a single-page application reads the workbook with the
 * signed-in user's own Graph token, so that token can reach the whole file
 * outside the app. Enforcement that survives a determined user requires a
 * server that holds the credentials and filters before responding. See
 * `src/docs/Access-Control.md`.
 */
export interface AccessScope {
  role: AppUser['role']

  /** The person's own employee row, when they have one. */
  developerId?: string

  /** The person's own mentor row, when they have one. */
  mentorId?: string

  /**
   * Employee ids in scope, or `null` for unrestricted access.
   *
   * `null` means admin. An empty array means "nothing", which is the correct
   * result for a mentor with no assignments or a developer account with no
   * employee row, and is deliberately not treated as "everything".
   */
  visibleDeveloperIds: readonly string[] | null

  /**
   * Whether the whole roster may be read, regardless of `visibleDeveloperIds`.
   *
   * Mentors maintain the roster but see work only for the developers assigned
   * to them, so the two questions have different answers for them and the
   * distinction has to be carried rather than derived from the id list. This
   * covers names, mentors and projects — the records needed to administer
   * people — and never daily updates, tasks or feedback, which stay narrowed
   * to `visibleDeveloperIds` for everybody.
   */
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
    // An assignment whose Status cell reads Inactive keeps the history but
    // grants nothing, which is how a mentor is taken off a developer without
    // erasing the record that they once mentored them.
    const assigned = assignments
      .filter(
        (assignment) => assignment.mentorId === user.mentorId && (assignment.active ?? true),
      )
      .map((assignment) => assignment.developerId)

    // A mentor also sees their own row where they have one, so a mentor who
    // logs work can still see their own entries.
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

/**
 * A stable identity for the scope, used in cache keys.
 *
 * Two people using the same browser profile must never share cached results,
 * so anything cached from a scoped query is keyed by this.
 */
export function describeScope(scope: AccessScope): string {
  const visible =
    scope.visibleDeveloperIds === null ? 'all' : [...scope.visibleDeveloperIds].sort().join(',')

  return `${scope.role}:${scope.developerId ?? '-'}:${visible}`
}

export function canViewDeveloper(scope: AccessScope, developerId: string): boolean {
  return scope.visibleDeveloperIds === null || scope.visibleDeveloperIds.includes(developerId)
}

/**
 * Narrows a requested list of employee ids to those in scope.
 *
 * Called with whatever the screen asked for; anything outside the scope is
 * dropped rather than rejected, so a stale filter or a hand-edited URL
 * silently yields less data instead of an error or a leak.
 *
 * Returns `undefined` only for unrestricted access with no filter requested,
 * which is the one case where the query needs no developer predicate at all.
 */
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
