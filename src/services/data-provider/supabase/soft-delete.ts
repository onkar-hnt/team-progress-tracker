import type { AppSupabaseClient } from '@services/supabase/index'

import { RecordNotFoundError } from '../data-provider.errors'
import type { DataSourceTable } from '../data-provider.errors'
import { mapPostgrestError } from './supabase-errors'

/**
 * Deleting, by setting a column instead of removing a row.
 *
 * Six tables mark a row deleted rather than destroying it, and the Recently
 * deleted screen hands it back: the three that hold written work — a daily update,
 * a task, a piece of feedback — and the three the roster is made of.
 * `20260913200000_soft_delete.sql` and `20260913220000_soft_delete_roster.sql`
 * carry the reasoning, including why this needs no authorization of its own: for
 * all six, the UPDATE policy admits exactly the people the DELETE policy admits, so
 * this is the same act as before with a different statement.
 *
 * What a roster row does keep is the refusal. An employee with logged work could
 * not be deleted before, because the foreign keys said so, and a `RESTRICT` is not
 * consulted by an UPDATE — so a trigger says it instead, and reports it as the same
 * error. Deleting is still for a record entered by mistake; deactivating is still
 * how somebody with a history leaves.
 *
 * Only the Supabase provider does this. The Excel and fixture providers still
 * delete outright, which is honest rather than a gap: a spreadsheet has no
 * triggers to stamp who did it, no policies to decide who may put it back, and
 * the person editing it can undo anything by pressing Ctrl+Z in Excel.
 */

/** The tables that keep what they delete, and the name each reports errors under. */
const SOFT_DELETABLE = {
  daily_updates: 'DailyWork',
  developers: 'Developers',
  // `Comments` rather than `Feedback`: the taxonomy names it after the domain
  // model, `MentorComment`, and the table after the sheet it came from.
  feedback: 'Comments',
  mentors: 'Mentors',
  projects: 'Projects',
  tasks: 'Tasks',
} as const satisfies Record<string, DataSourceTable>

export type SoftDeletableTable = keyof typeof SOFT_DELETABLE

/**
 * Marks a row deleted, or reports that there was nothing to delete.
 *
 * `.is('deleted_at', null)` is what makes deleting twice a not-found rather than a
 * silent success that moves the timestamp: the second attempt matches no row. It
 * is also why a stale screen — one still listing something a colleague removed a
 * moment ago — says the record is gone instead of appearing to remove it again.
 *
 * The timestamp sent here is not the one stored. A trigger replaces it with the
 * server's `now()`, because a browser clock can be wrong by hours; anything
 * non-null would do, and the real value is what the row is read back with.
 */
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
