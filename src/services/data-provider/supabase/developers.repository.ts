import type { CreateDeveloperRequest, Developer, UpdateDeveloperRequest } from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'
import { todayIsoDate } from '@utils/date.utils'

import { RecordNotFoundError } from '../data-provider.errors'
import {
  DEVELOPER_COLUMNS,
  developerRowSchema,
  toDeveloper,
  toDeveloperInsert,
  toDeveloperUpdate,
} from './developer.mappers'
import { assertProjectExists } from './references'
import { softDeleteRow } from './soft-delete'
import { mapPostgrestError, parseRows } from './supabase-errors'

/**
 * `public.developers`: the Employees table.
 *
 * Internal to `SupabaseDataProvider`, in the same way as the mentor
 * repository — `DataProvider` is still the only storage boundary the
 * application knows about; this is just where the statements for one table
 * live.
 *
 * No filtering by who is asking. `developers_select` applies
 * `can_view_developer(id)` server-side, so a mentor reading this table gets
 * their assigned developers and a developer gets their own row, without a
 * single `WHERE` clause here. `WorkTrackerService` narrows again for display.
 * Two independent limits, neither relying on the other.
 */

/**
 * Every employee the caller may see, including the ones in the bin.
 *
 * The deleted rows are here on purpose, and this is the one read where that is
 * true. `WorkTrackerService` drops them from the roster and from every picker, and
 * keeps them in the lookup it resolves names from — so an entry logged by somebody
 * whose record was deleted this morning still reads as their work rather than as
 * `Unknown (4f6c…)`. Filtering them out here would take that away from every screen
 * at once, and `deletedAt` on the record is what lets one caller make the
 * distinction the other does not need.
 */
export async function selectDevelopers(client: AppSupabaseClient): Promise<Developer[]> {
  const { data, error } = await client.from('developers').select(DEVELOPER_COLUMNS).order('code')

  if (error !== null) throw mapPostgrestError(error, { table: 'Developers', operation: 'read' })

  return parseRows('Developers', developerRowSchema, data ?? [], toDeveloper)
}

export async function insertDeveloper(
  client: AppSupabaseClient,
  request: CreateDeveloperRequest,
): Promise<Developer> {
  if (request.primaryProjectId !== undefined) {
    await assertProjectExists(client, request.primaryProjectId)
  }

  const payload = toDeveloperInsert({
    // Matches the Excel provider, which stamps the creation date on write. A
    // date is safe to decide here in a way an identifier is not.
    createdDate: todayIsoDate(),
    ...request,
  })

  const { data, error } = await client
    .from('developers')
    .insert(payload)
    // Read back rather than assumed: `id`, `code` and the timestamps are all
    // assigned by the database, and this is how the caller learns the code.
    .select(DEVELOPER_COLUMNS)
    .single()

  if (error !== null) throw mapPostgrestError(error, { table: 'Developers', operation: 'insert' })

  return parseRows('Developers', developerRowSchema, [data], toDeveloper)[0]!
}

/**
 * Applies a partial change, which is also how status is set.
 *
 * There is no separate activate/deactivate operation, here or in the
 * interface: `active` is an ordinary field the admin form edits as a
 * checkbox, and a second path to one column would only be able to disagree
 * with the first.
 */
export async function updateDeveloperRow(
  client: AppSupabaseClient,
  id: string,
  request: UpdateDeveloperRequest,
): Promise<Developer> {
  if (request.primaryProjectId !== undefined) {
    await assertProjectExists(client, request.primaryProjectId)
  }

  const payload = toDeveloperUpdate(request)

  // An update with nothing in it is a valid no-op that PostgREST rejects, so
  // it is answered with the current row instead.
  if (Object.keys(payload).length === 0) return requireDeveloper(client, id)

  const { data, error } = await client
    .from('developers')
    .update(payload)
    .eq('id', id)
    // A record in the bin is not editable until it is restored. Matching no row
    // reports it as missing below, which is what a stale screen still offering an
    // Edit button on a deleted employee should be told.
    .is('deleted_at', null)
    .select(DEVELOPER_COLUMNS)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Developers', operation: 'update', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Developers', id)

  return parseRows('Developers', developerRowSchema, [data], toDeveloper)[0]!
}

/**
 * Puts an employee in the bin, if nothing depends on them.
 *
 * Both halves of that sentence are older than this function. The refusal is the
 * `RESTRICT` foreign keys — tasks, daily updates, feedback and mentor assignments
 * alike — which is the point of the constraint rather than an obstacle to it: the
 * records that would be swept away are the work history this application exists to
 * keep, and the mapping saying who mentored whom is part of it. Deactivating the
 * employee keeps all of it and stops their access; deleting is for a row created by
 * mistake, and now that row can be recovered.
 *
 * A soft delete is an UPDATE, which a `RESTRICT` does not see, so the refusal is
 * restated by `guard_roster_deletion` and reaches here as the same
 * `RecordInUseError` it always did.
 */
export async function deleteDeveloperRow(client: AppSupabaseClient, id: string): Promise<void> {
  return softDeleteRow(client, 'developers', id)
}

/**
 * Reads one employee, or reports that there is none to read.
 *
 * Deleted rows are not read here, unlike in `selectDevelopers`. The two are asked
 * different questions: this one stands behind an edit, and a record in the bin is
 * not editable until it is restored, while the list is what display names are
 * resolved from and must still know who wrote last month's entries.
 */
export async function requireDeveloper(
  client: AppSupabaseClient,
  id: string,
): Promise<Developer> {
  const { data, error } = await client
    .from('developers')
    .select(DEVELOPER_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Developers', operation: 'read', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Developers', id)

  return parseRows('Developers', developerRowSchema, [data], toDeveloper)[0]!
}
