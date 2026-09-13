import type { AppSupabaseClient } from '@services/supabase/index'

import { RecordNotFoundError } from '../data-provider.errors'
import type { DataSourceTable } from '../data-provider.errors'
import { mapPostgrestError } from './supabase-errors'

/** Sets deleted_at instead of DELETE; UPDATE policy matches former DELETE policy. */

const SOFT_DELETABLE = {
  daily_updates: 'DailyWork',
  developers: 'Developers',
  feedback: 'Comments',
  mentors: 'Mentors',
  projects: 'Projects',
  tasks: 'Tasks',
} as const satisfies Record<string, DataSourceTable>

export type SoftDeletableTable = keyof typeof SOFT_DELETABLE

export async function softDeleteRow(
  client: AppSupabaseClient,
  table: SoftDeletableTable,
  id: string,
): Promise<void> {
  const label = SOFT_DELETABLE[table]

  const { data, error } = await client
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')

  if (error !== null) {
    throw mapPostgrestError(error, { table: label, operation: 'delete', recordId: id })
  }

  if ((data ?? []).length === 0) throw new RecordNotFoundError(label, id)
}
