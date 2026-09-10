import type { MentorAssignment } from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'
import { todayIsoDate } from '@utils/date.utils'

import {
  ASSIGNMENT_COLUMNS,
  mentorAssignmentRowSchema,
  toMentorAssignment,
} from './mentor.mappers'
import { requireMentor } from './mentors.repository'
import { assertDevelopersExist } from './references'
import { mapPostgrestError, parseRows } from './supabase-errors'

/**
 * `public.mentor_assignments`: which developers each mentor reviews.
 *
 * This mapping is what the whole access model rests on — both in the client,
 * where `buildAccessScope` reads it, and in the database, where
 * `can_view_developer()` reads the same rows. Writing it correctly therefore
 * matters more than the size of the table suggests.
 */

export async function selectMentorAssignments(
  client: AppSupabaseClient,
): Promise<MentorAssignment[]> {
  const { data, error } = await client.from('mentor_assignments').select(ASSIGNMENT_COLUMNS)

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'MentorMapping', operation: 'read' })
  }

  return parseRows('MentorMapping', mentorAssignmentRowSchema, data ?? [], toMentorAssignment)
}

/**
 * Replaces the whole set of developers assigned to one mentor.
 *
 * Set semantics, as the interface documents: whatever is passed is what the
 * mentor can see afterwards. Carried out as a difference against the current
 * rows rather than a delete-and-reinsert, so that re-saving a list without
 * changing it leaves `assigned_date` alone — the date a developer was
 * assigned should not move because somebody opened the dialog and pressed
 * save.
 *
 * Removed pairs are deleted rather than deactivated. The schema supports
 * either, but every reader of this table — the admin screen and
 * `buildAccessScope` alike — treats a present row as an assignment, so a
 * deactivated one would still show the developer as assigned.
 *
 * Not a transaction. PostgREST exposes no multi-statement transaction, so a
 * failure between the delete and the insert would leave the set partly
 * applied. Acceptable because the operation is idempotent: saving again
 * converges on the requested set. Moving this into a single `rpc()` is the
 * fix if that ever stops being good enough.
 */
export async function replaceMentorAssignments(
  client: AppSupabaseClient,
  mentorId: string,
  developerIds: readonly string[],
): Promise<MentorAssignment[]> {
  // Both checked before any write, so a mistyped id cannot clear an existing
  // mapping as a side effect.
  await requireMentor(client, mentorId)
  await assertDevelopersExist(client, developerIds)

  const current = (await selectMentorAssignments(client)).filter(
    (assignment) => assignment.mentorId === mentorId,
  )

  const target = new Set(developerIds)
  const removed = current
    .filter((assignment) => !target.has(assignment.developerId))
    .map((assignment) => assignment.developerId)

  if (removed.length > 0) {
    const { error } = await client
      .from('mentor_assignments')
      .delete()
      .eq('mentor_id', mentorId)
      .in('developer_id', removed)

    if (error !== null) {
      throw mapPostgrestError(error, {
        table: 'MentorMapping',
        operation: 'delete',
        recordId: mentorId,
      })
    }
  }

  const existing = new Map(current.map((assignment) => [assignment.developerId, assignment]))
  const added = developerIds.filter((developerId) => !existing.has(developerId))

  if (added.length > 0) {
    const { error } = await client.from('mentor_assignments').insert(
      added.map((developerId) => ({
        mentor_id: mentorId,
        developer_id: developerId,
        assigned_date: todayIsoDate(),
        active: true,
      })),
    )

    if (error !== null) {
      throw mapPostgrestError(error, { table: 'MentorMapping', operation: 'insert' })
    }
  }

  // A pair that survived from an earlier assignment may have been left
  // inactive by an older client. Ticking the developer again has to grant
  // visibility, so those rows are revived rather than ignored.
  const revived = developerIds.filter((developerId) => existing.get(developerId)?.active === false)

  if (revived.length > 0) {
    const { error } = await client
      .from('mentor_assignments')
      .update({ active: true })
      .eq('mentor_id', mentorId)
      .in('developer_id', revived)

    if (error !== null) {
      throw mapPostgrestError(error, {
        table: 'MentorMapping',
        operation: 'update',
        recordId: mentorId,
      })
    }
  }

  return (await selectMentorAssignments(client)).filter(
    (assignment) => assignment.mentorId === mentorId,
  )
}
