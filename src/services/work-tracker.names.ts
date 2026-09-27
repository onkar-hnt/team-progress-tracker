/**
 * Naming the people and projects a row points at.
 *
 * These read from unfiltered roster lookups on purpose, so work done by
 * somebody who has since left is still attributed to them rather than to an
 * id.
 */

import type { CommentAuthorRole, Developer, Mentor, MentorComment } from '@models/index'

/** Soft-deleted roster rows stay in lookups for `resolveName` but are filtered from lists. */
export function onTheRoster(record: { deletedAt?: string }): boolean {
  return record.deletedAt === undefined
}

export function resolveName(
  records: readonly { id: string; name: string }[],
  id: string | undefined,
  label: string,
): string {
  if (id === undefined) return `Unknown ${label}`
  return records.find((record) => record.id === id)?.name ?? `Unknown (${id})`
}

/**
 * Names the author of a comment.
 *
 * Resolved through the login behind the entry first, so somebody who holds both
 * a mentor and an employee record is named once, whichever capacity they wrote
 * in. Older entries carry no author, and fall back to the mentor they name.
 */
export function resolveAuthorName(
  comment: MentorComment,
  role: CommentAuthorRole,
  developers: readonly Developer[],
  mentors: readonly Mentor[],
): string {
  if (comment.authorProfileId !== undefined) {
    const author =
      mentors.find((candidate) => candidate.profileId === comment.authorProfileId) ??
      developers.find((candidate) => candidate.profileId === comment.authorProfileId)

    if (author !== undefined) return author.name
  }

  if (role === 'developer') return resolveName(developers, comment.developerId, 'developer')
  if (comment.mentorId !== undefined) return resolveName(mentors, comment.mentorId, 'mentor')

  return role === 'admin' ? 'Administrator' : 'Unknown mentor'
}
