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
 * The filtered read goes through `list_daily_updates` rather than a filter
 * chain — seven optional predicates was the longest of the three, and the
 * reasoning is recorded in
 * `20260913060000_filtered_list_functions.sql`. Reading, writing and deleting
 * one entry by id stay ordinary PostgREST calls.
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
 * `[].includes(x)` is false. Asking the database instead would rely on the
 * difference between an empty list and no list surviving the round trip, so
 * the answer is given here — and it saves a request. This is a real case, not
 * a defensive one: a mentor with no assigned developers has exactly this
 * scope, and every dashboard panel would otherwise ask for it.
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

  // The bounds are inclusive, matching the `<`/`>` rejections in the in-memory
  // version, and are compared as dates rather than as text — which agrees with
  // the string comparison for the zero-padded values the contract specifies.
  //
  // `isBlocked` is coalesced rather than listed, because `false` is an answer:
  // `false ?? null` is false, so asking for unblocked entries still asks.
  const { data, error } = await client.rpc('list_daily_updates', {
    p_date_from: query?.dateFrom ?? null,
    p_date_to: query?.dateTo ?? null,
    p_developer_ids: filterList(query?.developerIds),
    p_project_ids: filterList(query?.projectIds),
    p_statuses: filterList(query?.statuses),
    p_priorities: filterList(query?.priorities),
    p_is_blocked: query?.isBlocked ?? null,
  })

  if (error !== null) throw mapPostgrestError(error, { table: 'DailyWork', operation: 'read' })

  return parseRows('DailyWork', dailyUpdateRowSchema, data ?? [], toDailyWorkEntry)
}

/**
 * Resolves to `null` when no entry carries that id, as the interface states.
 *
 * A deleted entry is one of those. It exists as a row, but the only screen that
 * may see it is the bin, which reads it by a different path — so everything else
 * asking for it by id is told there is nothing there, which is what the person who
 * deleted it asked for.
 */
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

/**
 * Puts an entry aside rather than destroying it.
 *
 * The row keeps its place and stops being read; the Recently deleted screen hands
 * it back. See `soft-delete.ts`, and the migration it points at, for why this is
 * an UPDATE and why that needs no authorization the DELETE did not already have.
 */
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

/**
 * Checks the references an entry makes, for whichever of them are being set.
 *
 * The first two are `NOT NULL`, so unlike a task's mentor there is no
 * clearing case to skip: a key that is present is a value being written.
 * `taskId` is nullable, so an explicit `undefined` unlinks the entry and has
 * nothing to check.
 *
 * Whether the task belongs to the same developer is settled in the database
 * by `daily_updates_guard_task`, not here. A check from the browser could
 * only be advisory, and the rule has to hold for a write that never passed
 * through this code.
 */
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
