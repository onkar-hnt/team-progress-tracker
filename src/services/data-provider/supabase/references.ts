import type { AppSupabaseClient } from '@services/supabase/index'

import { ReferentialIntegrityError } from '../data-provider.errors'
import { mapPostgrestError } from './supabase-errors'

/** Pre-write existence checks; also reject soft-deleted rows FKs would still accept. */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export function isSupabaseUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export async function assertProjectExists(
  client: AppSupabaseClient,
  projectId: string,
): Promise<void> {
  if (!isSupabaseUuid(projectId)) throw new ReferentialIntegrityError('projectId', projectId)

  const { data, error } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) throw mapPostgrestError(error, { table: 'Projects', operation: 'read' })

  if (data === null) throw new ReferentialIntegrityError('projectId', projectId)
}

export async function assertMentorExists(
  client: AppSupabaseClient,
  mentorId: string,
): Promise<void> {
  if (!isSupabaseUuid(mentorId)) throw new ReferentialIntegrityError('mentorId', mentorId)

  const { data, error } = await client
    .from('mentors')
    .select('id')
    .eq('id', mentorId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) throw mapPostgrestError(error, { table: 'Mentors', operation: 'read' })

  if (data === null) throw new ReferentialIntegrityError('mentorId', mentorId)
}

export async function assertTaskExists(
  client: AppSupabaseClient,
  taskId: string,
): Promise<void> {
  if (!isSupabaseUuid(taskId)) throw new ReferentialIntegrityError('taskId', taskId)

  const { data, error } = await client
    .from('tasks')
    .select('id')
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) throw mapPostgrestError(error, { table: 'Tasks', operation: 'read' })

  if (data === null) throw new ReferentialIntegrityError('taskId', taskId)
}

export async function assertDeveloperExists(
  client: AppSupabaseClient,
  developerId: string,
): Promise<void> {
  await assertDevelopersExist(client, [developerId])
}

export async function assertDevelopersExist(
  client: AppSupabaseClient,
  developerIds: readonly string[],
): Promise<void> {
  if (developerIds.length === 0) return

  for (const developerId of developerIds) {
    if (!isSupabaseUuid(developerId)) {
      throw new ReferentialIntegrityError('developerId', developerId)
    }
  }

  const { data, error } = await client
    .from('developers')
    .select('id')
    .in('id', [...developerIds])
    .is('deleted_at', null)

  if (error !== null) throw mapPostgrestError(error, { table: 'Developers', operation: 'read' })

  const found = new Set((data ?? []).map((row) => (row as { id: string }).id))

  for (const developerId of developerIds) {
    if (!found.has(developerId)) throw new ReferentialIntegrityError('developerId', developerId)
  }
}
