import { z } from 'zod'

import { appConfig } from '@config/app.config'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

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

  changedByName?: string

  /** Absent when the change was made by a trigger rather than by a person. */
  changedByProfileId?: string

  /** Empty for a creation, a deletion and a restore, which have no field diff. */
  fields: FieldChange[]
}

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
  'id, table_name, record_id, action, subject, changed_by, changed_by_name, changed_at, changes' as const

const changeRowSchema = z.object({
  id: z.string().min(1),
  table_name: z.enum(
    Object.keys(HISTORY_KINDS) as [HistoryKind, ...HistoryKind[]],
  ),
  record_id: z.string().min(1),
  action: z.enum(Object.keys(HISTORY_ACTIONS) as [HistoryAction, ...HistoryAction[]]),
  subject: z.string(),
  changed_by: z.string().nullable(),
  changed_by_name: z.string(),
  changed_at: z.string().min(1),

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
    ...(row.changed_by_name === '' ? {} : { changedByName: row.changed_by_name }),

    fields: Object.entries(row.changes)
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

export async function listChanges(limit: number): Promise<ChangeRecord[]> {
  const { data, error } = await requireClient()
    .from('record_history')
    .select(HISTORY_COLUMNS)
    .order('changed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (error !== null) throw mapHistoryError(error)

  return parseChanges(data ?? [])
}

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
