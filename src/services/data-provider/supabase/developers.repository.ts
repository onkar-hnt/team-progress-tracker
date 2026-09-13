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
    createdDate: todayIsoDate(),
    ...request,
  })

  const { data, error } = await client
    .from('developers')
    .insert(payload)
    .select(DEVELOPER_COLUMNS)
    .single()

  if (error !== null) throw mapPostgrestError(error, { table: 'Developers', operation: 'insert' })

  return parseRows('Developers', developerRowSchema, [data], toDeveloper)[0]!
}

export async function updateDeveloperRow(
  client: AppSupabaseClient,
  id: string,
  request: UpdateDeveloperRequest,
): Promise<Developer> {
  if (request.primaryProjectId !== undefined) {
    await assertProjectExists(client, request.primaryProjectId)
  }

  const payload = toDeveloperUpdate(request)

  if (Object.keys(payload).length === 0) return requireDeveloper(client, id)

  const { data, error } = await client
    .from('developers')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select(DEVELOPER_COLUMNS)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Developers', operation: 'update', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Developers', id)

  return parseRows('Developers', developerRowSchema, [data], toDeveloper)[0]!
}

export async function deleteDeveloperRow(client: AppSupabaseClient, id: string): Promise<void> {
  return softDeleteRow(client, 'developers', id)
}

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
