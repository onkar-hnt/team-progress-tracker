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
import { softDeleteRow } from './soft-delete'
import { mapPostgrestError, parseRows } from './supabase-errors'

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
    createdDate: todayIsoDate(),
    ...request,
  })

  const { data, error } = await client
    .from('mentors')
    .insert(payload)
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

  if (Object.keys(payload).length === 0) return requireMentor(client, id)

  const { data, error } = await client
    .from('mentors')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select(MENTOR_COLUMNS)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Mentors', operation: 'update', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Mentors', id)

  return parseRows('Mentors', mentorRowSchema, [data], toMentor)[0]!
}

export async function deleteMentorRow(client: AppSupabaseClient, id: string): Promise<void> {
  return softDeleteRow(client, 'mentors', id)
}

/** Reads one mentor that is not in the bin, or reports that there is none to read. */
export async function requireMentor(client: AppSupabaseClient, id: string): Promise<Mentor> {
  const { data, error } = await client
    .from('mentors')
    .select(MENTOR_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Mentors', operation: 'read', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Mentors', id)

  return parseRows('Mentors', mentorRowSchema, [data], toMentor)[0]!
}
