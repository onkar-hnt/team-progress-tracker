import { z } from 'zod'

import { apiEndpoints } from '@config/api'
import { apiGet } from '@services/api/api-client'
import { describeApiConfigProblem, isApiConfigured } from '@services/api/api-config'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'

export function isHistoryAvailable(): boolean {
  return isApiConfigured()
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

function formatValue(value: string | null): string | undefined {
  if (value === null) return undefined

  const trimmed = value.trim()
  if (trimmed === '') return undefined
  return trimmed.length > 80 ? `${trimmed.slice(0, 79)}…` : trimmed
}

function requireApi(): void {
  const problem = describeApiConfigProblem()

  if (problem !== null) {
    throw new DataSourceUnavailableError(`The API is not configured. ${problem}`)
  }
}

const historyKindSchema = z.enum(
  Object.keys(HISTORY_KINDS) as [HistoryKind, ...HistoryKind[]],
)

const historyActionSchema = z.enum(
  Object.keys(HISTORY_ACTIONS) as [HistoryAction, ...HistoryAction[]],
)

const fieldChangeDtoSchema = z.object({
  field: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
})

const changeRecordDtoSchema = z.object({
  id: z.string().min(1),
  tableName: historyKindSchema,
  recordId: z.string().min(1),
  action: historyActionSchema,
  subject: z.string(),
  changedBy: z.string().nullable(),
  changedByName: z.string(),
  changedAt: z.string().min(1),
  changes: z.array(fieldChangeDtoSchema),
})

function toChangeRecord(row: z.infer<typeof changeRecordDtoSchema>): ChangeRecord {
  return {
    id: row.id,
    kind: row.tableName,
    action: row.action,
    subject: row.subject,
    recordId: row.recordId,
    changedAt: row.changedAt,
    ...(row.changedBy === null ? {} : { changedByProfileId: row.changedBy }),
    ...(row.changedByName === '' ? {} : { changedByName: row.changedByName }),

    fields: row.changes
      .map((change) => {
        const from = formatValue(change.before)
        const to = formatValue(change.after)

        return {
          label: FIELD_LABELS[change.field] ?? humanise(change.field),
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
        }
      })
      .sort((left, right) => left.label.localeCompare(right.label)),
  }
}

function parseChanges(rows: unknown): ChangeRecord[] {
  const parsed = z.array(changeRecordDtoSchema).safeParse(rows)

  if (!parsed.success) {
    throw new DataProviderError(
      'A change could not be read. The database schema may be ahead of this build.',
      { cause: parsed.error },
    )
  }

  return parsed.data.map(toChangeRecord)
}

export async function listChanges(limit: number): Promise<ChangeRecord[]> {
  requireApi()

  return parseChanges(await apiGet<unknown>(apiEndpoints.changeLog.recent, { query: { limit } }))
}

export async function listRecordChanges(
  kind: HistoryKind,
  recordId: string,
): Promise<ChangeRecord[]> {
  requireApi()

  return parseChanges(await apiGet<unknown>(apiEndpoints.changeLog.forRecord(kind, recordId)))
}
