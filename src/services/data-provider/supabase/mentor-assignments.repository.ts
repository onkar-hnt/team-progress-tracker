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
 * The difference is now computed and applied inside
 * `set_mentor_assignments`, which is one transaction: the delete and the
 * insert either both land or neither does. This used to be three statements
 * issued from here around two reads of the whole table, and a failure between
 * them left the set partly applied — and because `can_view_developer()` reads
 * these rows, a half-applied write here is a half-applied permission.
 *
 * The date is passed rather than left to the database. `current_date` is the
 * server's, in UTC, and a team assigning somebody late in the evening would
 * have it recorded as the day before.
 */
export async function replaceMentorAssignments(
  client: AppSupabaseClient,
  mentorId: string,
  developerIds: readonly string[],
): Promise<MentorAssignment[]> {
  // Both checked before the write, so a mistyped id cannot clear an existing
  // mapping as a side effect. Kept here rather than folded into the function:
  // these produce `RecordNotFoundError` and `ReferentialIntegrityError` naming
  // the field, which is what every screen already renders, and neither is the
  // multi-statement problem the function exists to solve.
  await requireMentor(client, mentorId)
  await assertDevelopersExist(client, developerIds)

  const { data, error } = await client.rpc('set_mentor_assignments', {
    p_mentor_id: mentorId,
    p_developer_ids: [...developerIds],
    p_assigned_date: todayIsoDate(),
  })

  if (error !== null) {
    throw mapPostgrestError(error, {
      table: 'MentorMapping',
      operation: 'update',
      recordId: mentorId,
    })
  }

  return parseRows('MentorMapping', mentorAssignmentRowSchema, data ?? [], toMentorAssignment)
}
