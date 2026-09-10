import type { CreateMentorRequest, Mentor, UpdateMentorRequest } from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'
import { todayIsoDate } from '@utils/date.utils'

import { RecordNotFoundError } from '../data-provider.errors'
import {
  MENTOR_COLUMNS,
  mentorRowSchema,
  toMentor,
  toMentorInsert,
  toMentorUpdate,
} from './mentor.mappers'
import { mapPostgrestError, parseRows } from './supabase-errors'

/**
 * `public.mentors`, as domain records.
 *
 * Internal to `SupabaseDataProvider`. This is not a second abstraction for
 * feature code to reach through — `DataProvider` remains the only storage
 * boundary the application knows about — it is simply where the provider
 * keeps the statements for one table, so that adding the next table does not
 * grow a single file without limit.
 *
 * No filtering happens here. Row-level security decides which rows come back,
 * and `WorkTrackerService` narrows further for display; a `WHERE` clause added
 * here would only duplicate one of those and eventually disagree with it.
 */

export async function selectMentors(client: AppSupabaseClient): Promise<Mentor[]> {
  const { data, error } = await client.from('mentors').select(MENTOR_COLUMNS).order('code')

  if (error !== null) throw mapPostgrestError(error, { table: 'Mentors', operation: 'read' })

  return parseRows('Mentors', mentorRowSchema, data ?? [], toMentor)
}

export async function insertMentor(
  client: AppSupabaseClient,
  request: CreateMentorRequest,
): Promise<Mentor> {
  const payload = toMentorInsert({
    // Matches the Excel provider, which stamps the creation date on write.
    // A date is safe to set here in a way an identifier is not: two browsers
    // agreeing on today cannot corrupt anything.
    createdDate: todayIsoDate(),
    ...request,
  })

  const { data, error } = await client
    .from('mentors')
    .insert(payload)
    // The row is read back rather than assumed, because `id`, `code` and the
    // timestamps are all assigned by the database. This is the only way the
    // caller learns the code that was issued.
    .select(MENTOR_COLUMNS)
    .single()

  if (error !== null) throw mapPostgrestError(error, { table: 'Mentors', operation: 'insert' })

  return parseRows('Mentors', mentorRowSchema, [data], toMentor)[0]!
}

export async function updateMentorRow(
  client: AppSupabaseClient,
  id: string,
  request: UpdateMentorRequest,
): Promise<Mentor> {
  const payload = toMentorUpdate(request)

  // An update with nothing in it is a valid no-op request that PostgREST
  // rejects, so it is answered with the current row instead.
  if (Object.keys(payload).length === 0) return requireMentor(client, id)

  const { data, error } = await client
    .from('mentors')
    .update(payload)
    .eq('id', id)
    .select(MENTOR_COLUMNS)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Mentors', operation: 'update', recordId: id })
  }

  // No row matched. Either it is gone, or row-level security filtered it out
  // — indistinguishable from here by design, since revealing which would
  // confirm the existence of a record the caller may not see.
  if (data === null) throw new RecordNotFoundError('Mentors', id)

  return parseRows('Mentors', mentorRowSchema, [data], toMentor)[0]!
}

/**
 * Removes a mentor, with the database deciding whether that is allowed.
 *
 * The Excel provider had to count comments and projects itself before
 * deleting, because a spreadsheet has no foreign keys. Here the keys say it:
 * `mentor_assignments` cascades, `projects.mentor_id` and `tasks.mentor_id`
 * fall to null, and `feedback.mentor_id` restricts — so a mentor who has
 * given feedback cannot be deleted, and the resulting violation is reported
 * as `RecordInUseError`, exactly as before.
 */
export async function deleteMentorRow(client: AppSupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from('mentors').delete().eq('id', id).select('id')

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Mentors', operation: 'delete', recordId: id })
  }

  if ((data ?? []).length === 0) throw new RecordNotFoundError('Mentors', id)
}

/** Reads one mentor, or reports that there is none to read. */
export async function requireMentor(client: AppSupabaseClient, id: string): Promise<Mentor> {
  const { data, error } = await client
    .from('mentors')
    .select(MENTOR_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Mentors', operation: 'read', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Mentors', id)

  return parseRows('Mentors', mentorRowSchema, [data], toMentor)[0]!
}
