import type {
  CreateDailyWorkEntryRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  UpdateDailyWorkEntryRequest,
} from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'

import { RecordNotFoundError } from '../data-provider.errors'
import {
  DAILY_UPDATE_COLUMNS,
  dailyUpdateRowSchema,
  toDailyUpdateInsert,
  toDailyUpdateUpdate,
  toDailyWorkEntry,
} from './daily-update.mappers'
import { assertDeveloperExists, assertProjectExists, assertTaskExists } from './references'
import { filterList } from './rpc-params'
import { softDeleteRow } from './soft-delete'
import { mapPostgrestError, parseRows } from './supabase-errors'

/** `setof` is an array. A single object is one row, not a failed read. */
function asDailyUpdateRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (data === null || data === undefined) return []
  return [data]
}

function matchesNothing(query: DailyWorkQuery): boolean {
  return (
    query.developerIds?.length === 0 ||
    query.projectIds?.length === 0 ||
    query.statuses?.length === 0 ||
    query.priorities?.length === 0
  )
}

export async function selectDailyUpdates(
  client: AppSupabaseClient,
  query?: DailyWorkQuery,
): Promise<DailyWorkEntry[]> {
  if (query !== undefined && matchesNothing(query)) return []

  const request = client.rpc('list_daily_updates', {
    p_date_from: query?.dateFrom ?? null,
    p_date_to: query?.dateTo ?? null,
    p_developer_ids: filterList(query?.developerIds),
    p_project_ids: filterList(query?.projectIds),
    p_statuses: filterList(query?.statuses),
    p_priorities: filterList(query?.priorities),
    p_is_blocked: query?.isBlocked ?? null,
  })

  const { data, error } =
    query?.limit === undefined
      ? await request
      : await request
          .order('entry_date', { ascending: false })
          .order('id', { ascending: false })
          .limit(query.limit)

  if (error !== null) throw mapPostgrestError(error, { table: 'DailyWork', operation: 'read' })

  return parseRows('DailyWork', dailyUpdateRowSchema, asDailyUpdateRows(data), toDailyWorkEntry)
}

export async function selectDailyUpdateById(
  client: AppSupabaseClient,
  id: string,
): Promise<DailyWorkEntry | null> {
  const { data, error } = await client
    .from('daily_updates')
    .select(DAILY_UPDATE_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'DailyWork', operation: 'read', recordId: id })
  }

  if (data === null) return null

  return parseRows('DailyWork', dailyUpdateRowSchema, [data], toDailyWorkEntry)[0]!
}

export async function insertDailyUpdate(
  client: AppSupabaseClient,
  request: CreateDailyWorkEntryRequest,
): Promise<DailyWorkEntry> {
  await assertEntryReferences(client, request)

  const { data, error } = await client
    .from('daily_updates')
    .insert(toDailyUpdateInsert(request))
    .select(DAILY_UPDATE_COLUMNS)
    .single()

  if (error !== null) throw mapPostgrestError(error, { table: 'DailyWork', operation: 'insert' })

  return parseRows('DailyWork', dailyUpdateRowSchema, [data], toDailyWorkEntry)[0]!
}

export async function updateDailyUpdateRow(
  client: AppSupabaseClient,
  id: string,
  request: UpdateDailyWorkEntryRequest,
): Promise<DailyWorkEntry> {
  await assertEntryReferences(client, request)

  const payload = toDailyUpdateUpdate(request)

  if (Object.keys(payload).length === 0) return requireDailyUpdate(client, id)

  const { data, error } = await client
    .from('daily_updates')
    .update(payload)
    .eq('id', id)
    .select(DAILY_UPDATE_COLUMNS)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'DailyWork', operation: 'update', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('DailyWork', id)

  return parseRows('DailyWork', dailyUpdateRowSchema, [data], toDailyWorkEntry)[0]!
}

export async function deleteDailyUpdateRow(
  client: AppSupabaseClient,
  id: string,
): Promise<void> {
  await softDeleteRow(client, 'daily_updates', id)
}

async function requireDailyUpdate(
  client: AppSupabaseClient,
  id: string,
): Promise<DailyWorkEntry> {
  const entry = await selectDailyUpdateById(client, id)
  if (entry === null) throw new RecordNotFoundError('DailyWork', id)
  return entry
}

async function assertEntryReferences(
  client: AppSupabaseClient,
  request: {
    developerId?: string | undefined
    projectId?: string | undefined
    taskId?: string | undefined
  },
): Promise<void> {
  if (request.developerId !== undefined) await assertDeveloperExists(client, request.developerId)
  if (request.projectId !== undefined) await assertProjectExists(client, request.projectId)
  if (request.taskId !== undefined) await assertTaskExists(client, request.taskId)
}
