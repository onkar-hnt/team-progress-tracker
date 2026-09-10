import type { AppSupabaseClient } from '@services/supabase/index'

import { ReferentialIntegrityError } from '../data-provider.errors'
import { mapPostgrestError } from './supabase-errors'

/**
 * Checks that a referenced record exists before a write depends on it.
 *
 * The foreign keys would catch every one of these anyway. Checking first
 * matters for two reasons: a multi-step write must not half-apply before the
 * database refuses it, and — while the migration is part-way through — an id
 * can arrive from the fixtures, where it is `PRJ001` rather than a uuid. A
 * malformed-input failure is a poor way to say "no such project".
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export function isSupabaseUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/**
 * Confirms a project exists, for `developers.primary_project_id`.
 *
 * Projects have not been migrated yet, so today this rejects every id the
 * project fixtures produce. That is the correct answer rather than a
 * limitation to work around: the column is a foreign key into a table those
 * records are genuinely not in.
 */
export async function assertProjectExists(
  client: AppSupabaseClient,
  projectId: string,
): Promise<void> {
  if (!isSupabaseUuid(projectId)) throw new ReferentialIntegrityError('projectId', projectId)

  const { data, error } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()

  if (error !== null) throw mapPostgrestError(error, { table: 'Projects', operation: 'read' })

  if (data === null) throw new ReferentialIntegrityError('projectId', projectId)
}

/** Confirms a mentor exists, for the accountable-mentor reference on a project. */
export async function assertMentorExists(
  client: AppSupabaseClient,
  mentorId: string,
): Promise<void> {
  if (!isSupabaseUuid(mentorId)) throw new ReferentialIntegrityError('mentorId', mentorId)

  const { data, error } = await client.from('mentors').select('id').eq('id', mentorId).maybeSingle()

  if (error !== null) throw mapPostgrestError(error, { table: 'Mentors', operation: 'read' })

  if (data === null) throw new ReferentialIntegrityError('mentorId', mentorId)
}

/** Confirms one developer exists, for a record that names a single assignee. */
export async function assertDeveloperExists(
  client: AppSupabaseClient,
  developerId: string,
): Promise<void> {
  await assertDevelopersExist(client, [developerId])
}

/**
 * Confirms every developer exists before a multi-step write depends on them.
 *
 * Checked as a set rather than one at a time, so a list of twenty costs one
 * round trip. The first missing id is reported, which is enough to fix the
 * request.
 */
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

  const { data, error } = await client.from('developers').select('id').in('id', [...developerIds])

  if (error !== null) throw mapPostgrestError(error, { table: 'Developers', operation: 'read' })

  const found = new Set((data ?? []).map((row) => (row as { id: string }).id))

  for (const developerId of developerIds) {
    if (!found.has(developerId)) throw new ReferentialIntegrityError('developerId', developerId)
  }
}
