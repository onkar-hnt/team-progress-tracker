import type { CreateLeaveDayRequest, LeaveDay, LeaveDayQuery } from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'

import { LEAVE_DAY_COLUMNS, leaveDayRowSchema, toLeaveDay, toLeaveDayInsert } from './leave.mappers'
import { assertDeveloperExists } from '../references'
import { mapPostgrestError, parseRows } from '../supabase-errors'

/**
 * Read straight from the table rather than through a list function. The row is
 * six columns with no join and no soft delete, and the select policy already
 * narrows it to the developers the reader may see.
 */
export async function selectLeaveDays(
  client: AppSupabaseClient,
  query?: LeaveDayQuery,
): Promise<LeaveDay[]> {
  if (query?.developerIds?.length === 0) return []

  let request = client.from('leave_days').select(LEAVE_DAY_COLUMNS)

  if (query?.dateFrom !== undefined) request = request.gte('leave_date', query.dateFrom)
  if (query?.dateTo !== undefined) request = request.lte('leave_date', query.dateTo)
  if (query?.developerIds !== undefined) {
    request = request.in('developer_id', [...query.developerIds])
  }

  const { data, error } = await request.order('leave_date', { ascending: false })

  if (error !== null) throw mapPostgrestError(error, { table: 'LeaveDays', operation: 'read' })

  return parseRows('LeaveDays', leaveDayRowSchema, data ?? [], toLeaveDay)
}

export async function insertLeaveDay(
  client: AppSupabaseClient,
  request: CreateLeaveDayRequest,
): Promise<LeaveDay> {
  await assertDeveloperExists(client, request.developerId)

  const { data, error } = await client
    .from('leave_days')
    .insert(toLeaveDayInsert(request))
    .select(LEAVE_DAY_COLUMNS)
    .single()

  if (error !== null) throw mapPostgrestError(error, { table: 'LeaveDays', operation: 'insert' })

  return parseRows('LeaveDays', leaveDayRowSchema, [data], toLeaveDay)[0]!
}

/**
 * A hard delete. The row carries nothing but the statement that a day was
 * leave, so taking it back leaves nothing worth keeping in the bin.
 */
export async function deleteLeaveDayRow(client: AppSupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('leave_days').delete().eq('id', id)

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'LeaveDays', operation: 'delete', recordId: id })
  }
}
