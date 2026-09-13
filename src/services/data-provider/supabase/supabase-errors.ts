import type { PostgrestError } from '@supabase/supabase-js'
import type { z } from 'zod'

import {
  DataProviderError,
  DataSourceUnavailableError,
  DuplicateRecordError,
  RecordInUseError,
  RecordNotFoundError,
  ReferentialIntegrityError,
  RowValidationError,
  SchemaMismatchError,
} from '../data-provider.errors'
import type { DataSourceTable, ReferenceField, RowValidationIssue } from '../data-provider.errors'

const PG_CODES = {
  invalidTextRepresentation: '22P02',
  notNullViolation: '23502',
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
  checkViolation: '23514',
  insufficientPrivilege: '42501',
  undefinedColumn: '42703',
  undefinedTable: '42P01',
} as const

/** PostgREST's own codes, which are not SQLSTATE. */
const POSTGREST_CODES = {
  /** `.single()` matched no rows, or more than one. */
  noSingleRow: 'PGRST116',
  /** The JWT is missing, malformed or expired. */
  invalidJwt: 'PGRST301',
} as const

const UNIQUE_CONSTRAINT_MESSAGES: Readonly<Record<string, string>> = {
  mentors_email_key: 'Another mentor already uses that email address.',
  profiles_email_key: 'Another account already uses that email address.',
  developers_email_key: 'Another employee already uses that email address.',
  developers_employee_id_key: 'Another employee already has that employee id.',
  mentor_assignments_unique_pair: 'That developer is already assigned to this mentor.',
}

/** Maps a foreign-key column onto the reference the taxonomy names. */
const REFERENCE_COLUMNS: Readonly<Record<string, ReferenceField>> = {
  developer_id: 'developerId',
  mentor_id: 'mentorId',
  project_id: 'projectId',
  task_id: 'taskId',
}

const DEPENDENT_LABELS: Readonly<Record<string, string>> = {
  daily_updates: 'daily updates',
  feedback: 'feedback',
  mentor_assignments: 'mentor assignments',
  mentors: 'mentor records',
  developers: 'employee records',
  project_developers: 'project assignments',
  projects: 'projects',
  tasks: 'tasks',
}

export type SupabaseOperation = 'read' | 'insert' | 'update' | 'delete'

export interface SupabaseErrorContext {
  table: DataSourceTable
  operation: SupabaseOperation
  /** The record being written or removed, when the operation targets one. */
  recordId?: string
}

/** `Key (developer_id)=(4f6…) is not present in table "developers".` */
const MISSING_REFERENCE_PATTERN = /Key \((?<column>[^)]+)\)=\((?<value>[^)]*)\)/u

/** `Key (id)=(4f6…) is still referenced from table "feedback".` */
const DEPENDENT_TABLE_PATTERN = /still referenced from table "(?<table>[^"]+)"/u

/** `duplicate key value violates unique constraint "mentors_email_key"` */
const CONSTRAINT_NAME_PATTERN = /constraint "(?<name>[^"]+)"/u

function readConstraintName(error: PostgrestError): string | null {
  return CONSTRAINT_NAME_PATTERN.exec(error.message)?.groups?.name ?? null
}

function isTransportFailure(error: PostgrestError): boolean {
  if (error.code !== '' && error.code !== undefined) return false
  return /fetch|network|connection|timeout/iu.test(error.message)
}

function mapForeignKeyViolation(
  error: PostgrestError,
  context: SupabaseErrorContext,
): DataProviderError {
  if (context.operation === 'delete') {
    const dependent = DEPENDENT_TABLE_PATTERN.exec(error.details ?? '')?.groups?.table

    return new RecordInUseError(context.table, context.recordId ?? 'unknown', [
      dependent === undefined
        ? 'other records'
        : (DEPENDENT_LABELS[dependent] ?? `records in "${dependent}"`),
    ])
  }

  const match = MISSING_REFERENCE_PATTERN.exec(error.details ?? '')?.groups
  const field = match?.column === undefined ? undefined : REFERENCE_COLUMNS[match.column]

  if (field !== undefined) return new ReferentialIntegrityError(field, match?.value ?? 'unknown')

  return new DataProviderError(
    'That change refers to a record which does not exist. Reload the page and try again.',
    { cause: error },
  )
}

function mapUniqueViolation(
  error: PostgrestError,
  context: SupabaseErrorContext,
): DataProviderError {
  const constraint = readConstraintName(error)
  const explained = constraint === null ? undefined : UNIQUE_CONSTRAINT_MESSAGES[constraint]

  if (explained !== undefined) return new DataProviderError(explained, { cause: error })

  if (constraint !== null && /_pkey$|_code_key$/u.test(constraint)) {
    return new DuplicateRecordError(context.table, [context.recordId ?? 'unknown'])
  }

  return new DataProviderError(
    'Those details clash with a record that already exists. Change them and try again.',
    { cause: error },
  )
}

export function mapPostgrestError(
  error: PostgrestError,
  context: SupabaseErrorContext,
): DataProviderError {
  if (isTransportFailure(error)) {
    return new DataSourceUnavailableError(
      'The database could not be reached. Check your connection and try again.',
      { cause: error },
    )
  }

  switch (error.code) {
    case PG_CODES.foreignKeyViolation:
      return mapForeignKeyViolation(error, context)

    case PG_CODES.uniqueViolation:
      return mapUniqueViolation(error, context)

    case PG_CODES.invalidTextRepresentation:
      return new RecordNotFoundError(context.table, context.recordId ?? 'unknown')

    case PG_CODES.notNullViolation:
    case PG_CODES.checkViolation:
      return new DataProviderError(
        `That change was rejected because it does not meet the rules for ${context.table}. ` +
          'Check the values and try again.',
        { cause: error },
      )

    case PG_CODES.insufficientPrivilege:
      return new DataProviderError(
        `You do not have permission to ${describeOperation(context.operation)} this record.`,
        { cause: error },
      )

    case PG_CODES.undefinedColumn:
      return new SchemaMismatchError(context.table, [
        MISSING_REFERENCE_PATTERN.exec(error.message)?.groups?.column ?? error.message,
      ])

    case PG_CODES.undefinedTable:
      return new DataSourceUnavailableError(
        `The database is missing the table behind ${context.table}. ` +
          'The migrations in `supabase/migrations` may not have been applied.',
        { cause: error },
      )

    case POSTGREST_CODES.noSingleRow:
      return new RecordNotFoundError(context.table, context.recordId ?? 'unknown')

    case POSTGREST_CODES.invalidJwt:
      return new DataSourceUnavailableError('Your session has expired. Sign in again.', {
        cause: error,
      })

    default:
      return new DataProviderError(error.message, { cause: error })
  }
}

function describeOperation(operation: SupabaseOperation): string {
  switch (operation) {
    case 'read':
      return 'view'
    case 'insert':
      return 'create'
    case 'update':
      return 'change'
    case 'delete':
      return 'delete'
  }
}

export function parseRows<TRow, TRecord>(
  table: DataSourceTable,
  schema: z.ZodType<TRow>,
  rows: readonly unknown[],
  toRecord: (row: TRow) => TRecord,
): TRecord[] {
  const records: TRecord[] = []
  const issues: RowValidationIssue[] = []

  rows.forEach((row, index) => {
    const parsed = schema.safeParse(row)

    if (parsed.success) {
      records.push(toRecord(parsed.data))
      return
    }

    issues.push({
      index,
      ...readRowId(row),
      messages: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    })
  })

  if (issues.length > 0) throw new RowValidationError(table, issues)

  return records
}

/** Best effort at naming the offending row, for the diagnostics only. */
function readRowId(row: unknown): { recordId?: string } {
  if (typeof row !== 'object' || row === null) return {}

  const candidate = (row as { code?: unknown; id?: unknown }).code ?? (row as { id?: unknown }).id
  return typeof candidate === 'string' ? { recordId: candidate } : {}
}
