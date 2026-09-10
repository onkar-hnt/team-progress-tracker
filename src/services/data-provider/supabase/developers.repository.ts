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
    .select(DEVELOPER_COLUMNS)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Developers', operation: 'update', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Developers', id)

  return parseRows('Developers', developerRowSchema, [data], toDeveloper)[0]!
}

/**
 * Removes an employee, if nothing depends on them.
 *
 * A deliberate change of behaviour from the Excel provider, which deleted the
 * person's mentor-mapping rows along with them. Every foreign key into this
 * table is `RESTRICT` — tasks, daily updates, feedback and mentor assignments
 * alike — so the delete is refused instead, and reported as `RecordInUseError`.
 *
 * That is the point of the constraint rather than an obstacle to it. The
 * records that would have been swept away are the work history this
 * application exists to keep, and the mapping saying who mentored whom is
 * part of it. Deactivating the employee keeps all of it and stops their
 * access; deleting is for a row created by mistake.
 */
export async function deleteDeveloperRow(client: AppSupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from('developers').delete().eq('id', id).select('id')

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Developers', operation: 'delete', recordId: id })
  }

  if ((data ?? []).length === 0) throw new RecordNotFoundError('Developers', id)
}

/** Reads one employee, or reports that there is none to read. */
export async function requireDeveloper(
  client: AppSupabaseClient,
  id: string,
): Promise<Developer> {
  const { data, error } = await client
    .from('developers')
    .select(DEVELOPER_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Developers', operation: 'read', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Developers', id)

  return parseRows('Developers', developerRowSchema, [data], toDeveloper)[0]!
}
