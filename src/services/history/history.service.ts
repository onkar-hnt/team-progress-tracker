import { z } from 'zod'

import { appConfig } from '@config/app.config'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

/**
 * What changed, read back.
 *
 * ## Why this sits outside `DataProvider`
 *
 * The same argument as notifications, accounts and the recycle bin, and it is worth
 * restating because it is the fourth time: `DataProvider` is the seam that makes the
 * record store replaceable, and a change log is not something a spreadsheet can
 * keep. A workbook has no trigger to catch a write, no session to attribute it to,
 * and anybody editing it can change a cell without this application ever seeing it —
 * so a log kept there would be silently incomplete, which is worse than absent.
 *
 * So it is a Supabase feature and says so, through `isHistoryAvailable`. The screen
 * shows a placeholder under the other data sources rather than an empty log that
 * could never fill.
 *
 * ## Where the authorization is
 *
 * Entirely in `record_history_select`, and nothing here narrows or widens it. Work
 * history is visible to whoever may see that developer's work, roster history to
 * whoever maintains the roster, and the table has no write policy at all — so this
 * module reads and never writes, not by convention but because there is nothing
 * else it could do.
 */

export function isHistoryAvailable(): boolean {
  return appConfig.dataSource === 'supabase' && isSupabaseConfigured()
}

/** The tables a change can be recorded against, named as the domain names them. */
export const HISTORY_KINDS = {
  daily_updates: 'Work entry',
  developers: 'Employee',
  feedback: 'Feedback',
  mentors: 'Mentor',
  projects: 'Project',
  tasks: 'Task',
} as const satisfies Record<string, string>

export type HistoryKind = keyof typeof HISTORY_KINDS

export const HISTORY_ACTIONS = {
  create: 'Created',
  delete: 'Deleted',
  restore: 'Restored',
  update: 'Changed',
} as const satisfies Record<string, string>

export type HistoryAction = keyof typeof HISTORY_ACTIONS

/** One field that moved, ready to be read as a sentence. */
export interface FieldChange {
  /** The column, humanised: `is_blocked` reads as "Blocked". */
  label: string

  /** Formatted for display. `undefined` where the value was not set. */
  from?: string
  to?: string
}

export interface ChangeRecord {
  id: string
  kind: HistoryKind
  action: HistoryAction

  /** The record this happened to, as it was named at the time. */
  subject: string

  recordId: string
  changedAt: string

  /** Absent when the change was made by a trigger rather than by a person. */
  changedByProfileId?: string

  /** Empty for a creation, a deletion and a restore, which have no field diff. */
  fields: FieldChange[]
}

/**
 * How a column is named on screen.
 *
 * Only the columns whose humanised name would be wrong or unclear are listed; the
 * rest fall through to `humanise`, which turns `hours_spent` into "Hours spent" and
 * is right often enough that listing every column would be a maintenance cost for no
 * gain. The ones here are the ones where the column name and the label people use
 * genuinely differ.
 */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  access_role: 'Access level',
  active: 'Active',
  employee_id: 'Employee id',
  entry_date: 'Date',
  feedback_date: 'Date',
  is_blocked: 'Blocked',
  mentor_id: 'Mentor',
  primary_project_id: 'Primary project',
  profile_id: 'Login',
  project_id: 'Project',
  developer_id: 'Employee',
  task_id: 'Task',
  task_title: 'Task',
  comment: 'Comment',
}

function humanise(column: string): string {
  const spaced = column.replace(/_/gu, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * A stored JSON value as a short piece of display text.
 *
 * Ids are left as they are rather than resolved. The log is read as a page of many
 * changes to many records, and resolving every id in it would mean a request per
 * distinct value — for a column like `project_id` the *label* already says what
 * moved, which is what somebody scanning the log needs; the record itself is one
 * click away for the detail.
 */
function formatValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return undefined
    return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed
  }

  return JSON.stringify(value)
}

function requireClient() {
  if (!isHistoryAvailable()) {
    throw new DataSourceUnavailableError(
      'The change log needs the Supabase data source, which is not configured.',
    )
  }

  return getSupabaseClient()
}

/**
 * A missing table means the migration has not been applied.
 *
 * `42P01` is Postgres on an unknown table and `PGRST205` is PostgREST's schema cache
 * saying the same. Named outright, because the generic wording sends whoever hit it
 * looking for a network fault instead of a pending deploy.
 */
const MISSING_TABLE_CODES: ReadonlySet<string> = new Set(['42P01', 'PGRST205'])

function mapHistoryError(error: { code: string; message: string }): DataProviderError {
  if (MISSING_TABLE_CODES.has(error.code)) {
    return new DataSourceUnavailableError(
      'The change log is not set up in this database yet. Apply supabase/migrations/20260913230000_change_history.sql, then reload.',
      { cause: error },
    )
  }

  return new DataProviderError('The change log could not be read.', { cause: error })
}

const HISTORY_COLUMNS =
  'id, table_name, record_id, action, subject, changed_by, changed_at, changes' as const

const changeRowSchema = z.object({
  id: z.string().min(1),
  table_name: z.enum(
    Object.keys(HISTORY_KINDS) as [HistoryKind, ...HistoryKind[]],
  ),
  record_id: z.string().min(1),
  action: z.enum(Object.keys(HISTORY_ACTIONS) as [HistoryAction, ...HistoryAction[]]),
  subject: z.string(),
  changed_by: z.string().nullable(),
  changed_at: z.string().min(1),

  // Shape checked one level down and no further: the values are whatever the column
  // held, and constraining them here would reject a change to a column this build
  // has never heard of — which is the one thing a log of an evolving schema must
  // still be able to show.
  changes: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })),
})

function toChangeRecord(row: z.infer<typeof changeRowSchema>): ChangeRecord {
  return {
    id: row.id,
    kind: row.table_name,
    action: row.action,
    subject: row.subject,
    recordId: row.record_id,
    changedAt: row.changed_at,
    ...(row.changed_by === null ? {} : { changedByProfileId: row.changed_by }),

    fields: Object.entries(row.changes)
      // Sorted by label so two changes to the same pair of fields read the same way
      // twice. `Object.entries` follows insertion order, which for a value built by
      // `jsonb_object_agg` is the planner's business rather than anything stable.
      .map(([column, change]) => {
        const from = formatValue(change.from)
        const to = formatValue(change.to)

        return {
          label: FIELD_LABELS[column] ?? humanise(column),
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
        }
      })
      .sort((left, right) => left.label.localeCompare(right.label)),
  }
}

/**
 * The most recent changes the caller may see.
 *
 * A growing limit, the same shape as the notification panel and the paged feedback
 * lists: one row more than the page is fetched, and whether it arrived is how the
 * screen knows there is another page. No filters — the policy decides whose changes
 * these are, and the screen searches and narrows what it has, because the columns
 * worth narrowing by are the subject and the person, and both read better as a
 * search over a page than as six dropdowns.
 */
export async function listChanges(limit: number): Promise<ChangeRecord[]> {
  const { data, error } = await requireClient()
    .from('record_history')
    .select(HISTORY_COLUMNS)
    .order('changed_at', { ascending: false })
    // Tie-broken by id, because a save that changes a task and its entry writes two
    // rows in the same statement with the same timestamp, and they should not swap
    // places between one read and the next.
    .order('id', { ascending: false })
    .limit(limit)

  if (error !== null) throw mapHistoryError(error)

  return parseChanges(data ?? [])
}

/**
 * Everything that has happened to one record, oldest last.
 *
 * Unlimited, unlike the log itself: this is the history of one thing, and the point
 * of opening it is to see all of it. A record with hundreds of changes would be
 * remarkable rather than routine.
 */
export async function listRecordChanges(
  kind: HistoryKind,
  recordId: string,
): Promise<ChangeRecord[]> {
  const { data, error } = await requireClient()
    .from('record_history')
    .select(HISTORY_COLUMNS)
    .eq('table_name', kind)
    .eq('record_id', recordId)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false })

  if (error !== null) throw mapHistoryError(error)

  return parseChanges(data ?? [])
}

function parseChanges(rows: readonly unknown[]): ChangeRecord[] {
  const parsed = z.array(changeRowSchema).safeParse(rows)

  if (!parsed.success) {
    throw new DataProviderError(
      'A change could not be read. The database schema may be ahead of this build.',
      { cause: parsed.error },
    )
  }

  return parsed.data.map(toChangeRecord)
}
