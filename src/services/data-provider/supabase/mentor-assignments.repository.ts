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

export async function selectMentorAssignments(
  client: AppSupabaseClient,
): Promise<MentorAssignment[]> {
  const { data, error } = await client.from('mentor_assignments').select(ASSIGNMENT_COLUMNS)

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'MentorMapping', operation: 'read' })
  }

  return parseRows('MentorMapping', mentorAssignmentRowSchema, data ?? [], toMentorAssignment)
}

export async function replaceMentorAssignments(
  client: AppSupabaseClient,
  mentorId: string,
  developerIds: readonly string[],
): Promise<MentorAssignment[]> {
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
