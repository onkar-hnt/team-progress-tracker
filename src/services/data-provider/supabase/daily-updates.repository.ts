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
import { assertDeveloperExists, assertProjectExists } from './references'
import { mapPostgrestError, parseRows } from './supabase-errors'

/**
 * `public.daily_updates`: what a developer reports having done on a day.
 *
 * Filters at source, as tasks do, and for the same reason: the query the
 * interface already defines maps onto SQL, and the schema carries indexes
 * built for these predicates — `daily_updates_developer_date_idx`,
 * `daily_updates_entry_date_idx` and the partial
 * `daily_updates_blocked_idx` — which only earn their keep if the filtering
 * reaches the database. This is the busiest table in the application; the
 * dashboard reads it for every day and every week it draws.
 *
 * The translation must agree with `matchesDailyWorkQuery`, the in-memory
 * evaluation the other two providers share. `WorkTrackerService` re-applies
 * the developer predicate over whatever comes back, so a mistake here could
 * not widen a result past the caller's scope, but it could still narrow one
 * wrongly, and the two are checked against each other during verification.
 */

/**
 * An empty list in the query means "nothing matches".
 *
 * `matchesDailyWorkQuery` reaches that answer naturally, since
 * `[].includes(x)` is false. Sending it to PostgREST as `in.()` would rely on
 * how the server treats an empty set, so the answer is given here instead —
 * and it saves a request. This is a real case, not a defensive one: a mentor
 * with no assigned developers has exactly this scope, and every dashboard
 * panel would otherwise ask for it.
 */
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

  // Each filter method returns the same builder, so the query is assembled
  // by reassignment rather than by casting between shapes.
  let builder = client.from('daily_updates').select(DAILY_UPDATE_COLUMNS)

  // Inclusive bounds, matching the `<`/`>` rejections in the in-memory
  // version. Compared here as dates rather than as text, which agrees with
  // the string comparison for the zero-padded values the contract specifies.
  if (query?.dateFrom !== undefined) builder = builder.gte('entry_date', query.dateFrom)
  if (query?.dateTo !== undefined) builder = builder.lte('entry_date', query.dateTo)

  if (query?.developerIds !== undefined) {
    builder = builder.in('developer_id', [...query.developerIds])
  }
  if (query?.projectIds !== undefined) builder = builder.in('project_id', [...query.projectIds])
  if (query?.statuses !== undefined) builder = builder.in('status', [...query.statuses])
  if (query?.priorities !== undefined) builder = builder.in('priority', [...query.priorities])

  // `is_blocked` is NOT NULL, so equality covers both answers and there is no
  // third state for a null to fall into.
  if (query?.isBlocked !== undefined) builder = builder.eq('is_blocked', query.isBlocked)

  const { data, error } = await builder

  if (error !== null) throw mapPostgrestError(error, { table: 'DailyWork', operation: 'read' })

  return parseRows('DailyWork', dailyUpdateRowSchema, data ?? [], toDailyWorkEntry)
}

/** Resolves to `null` when no entry carries that id, as the interface states. */
export async function selectDailyUpdateById(
  client: AppSupabaseClient,
  id: string,
): Promise<DailyWorkEntry | null> {
  const { data, error } = await client
    .from('daily_updates')
    .select(DAILY_UPDATE_COLUMNS)
    .eq('id', id)
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
  const { data, error } = await client.from('daily_updates').delete().eq('id', id).select('id')

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'DailyWork', operation: 'delete', recordId: id })
  }

  if ((data ?? []).length === 0) throw new RecordNotFoundError('DailyWork', id)
}

async function requireDailyUpdate(
  client: AppSupabaseClient,
  id: string,
): Promise<DailyWorkEntry> {
  const entry = await selectDailyUpdateById(client, id)
  if (entry === null) throw new RecordNotFoundError('DailyWork', id)
  return entry
}

/**
 * Checks the references an entry makes, for whichever of them are being set.
 *
 * Both are `NOT NULL`, so unlike a task's mentor there is no clearing case to
 * skip: a key that is present is a value being written.
 */
async function assertEntryReferences(
  client: AppSupabaseClient,
  request: { developerId?: string | undefined; projectId?: string | undefined },
): Promise<void> {
  if (request.developerId !== undefined) await assertDeveloperExists(client, request.developerId)
  if (request.projectId !== undefined) await assertProjectExists(client, request.projectId)
}
