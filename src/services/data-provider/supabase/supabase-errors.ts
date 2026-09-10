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

/**
 * Translation from PostgreSQL and PostgREST failures into the error taxonomy
 * the application already speaks.
 *
 * The taxonomy is unchanged, and deliberately so: every screen already
 * renders these errors, and the whole point of `DataProvider` is that what
 * reaches the UI does not depend on which backend produced it. So a
 * constraint violation becomes the same `RecordInUseError` the Excel provider
 * raises from counting rows, and the mentor page needs no Postgres knowledge
 * to explain it.
 *
 * The direction of the translation is worth stating plainly: with Excel, the
 * provider *enforced* integrity because a spreadsheet cannot. Here the
 * database enforces it and the provider reports what it decided. That is why
 * these mappings read constraint names rather than counting dependent rows.
 */

/**
 * The SQLSTATE codes worth distinguishing.
 *
 * Anything not listed falls through to a generic `DataProviderError`, which
 * keeps the database's own message. That is the right default: an unmapped
 * code is rarer and stranger than the message it carries, so replacing that
 * message with something vaguer would lose the only useful detail.
 */
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

/**
 * Which unique constraints have an explanation better than their own name.
 *
 * Postgres reports the index, not the intent: "duplicate key value violates
 * unique constraint mentors_email_key" is accurate and useless to whoever
 * typed the address. Only constraints a person can actually trip are listed;
 * the rest keep the generic wording.
 */
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
}

/**
 * What to call the table blocking a delete.
 *
 * `RecordInUseError` puts this straight into a sentence read by whoever
 * pressed Delete, and `records in "mentor_assignments"` is the database's
 * vocabulary rather than theirs.
 */
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

/**
 * What the failed statement was trying to do.
 *
 * Needed because a foreign-key violation means opposite things in the two
 * directions: on a write, the row being pointed *at* is missing; on a delete,
 * rows still point at the one being removed. Postgres reports both as 23503,
 * and the `details` text that distinguishes them is not guaranteed to be
 * present, so the caller states its intent rather than the mapper guessing.
 */
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

/**
 * A network failure rather than a rejected statement.
 *
 * `postgrest-js` catches `fetch` rejections and returns them in the same
 * shape as a database error, with an empty code. Without this check a dropped
 * connection would be reported as an unexplained data fault.
 */
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
      // Named when Postgres says which table, and left vague when it does
      // not — there is still something worth saying, namely that something
      // depends on this row, so the delete does not fail silently.
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

  // A collision on the primary key or a business code is a different problem:
  // two records claiming one identity, which is what this error exists for.
  if (constraint !== null && /_pkey$|_code_key$/u.test(constraint)) {
    return new DuplicateRecordError(context.table, [context.recordId ?? 'unknown'])
  }

  return new DataProviderError(
    'Those details clash with a record that already exists. Change them and try again.',
    { cause: error },
  )
}

/**
 * Maps a rejected statement onto the application's errors.
 *
 * Every mapped error keeps the original as `cause`, so the exact SQLSTATE and
 * constraint remain available in the console even though the message shown on
 * screen is written for whoever hit it.
 */
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
      // An id or value the column's type cannot hold — a `DEV001` where a
      // uuid is expected, most likely. Reported as a missing record rather
      // than a type error, because that is what it means to the caller: no
      // such row can exist.
      return new RecordNotFoundError(context.table, context.recordId ?? 'unknown')

    case PG_CODES.notNullViolation:
    case PG_CODES.checkViolation:
      // The database rejected the values themselves. Forms validate the same
      // rules with Zod, so reaching here means either a rule the form does
      // not know or a request that did not come from one.
      return new DataProviderError(
        `That change was rejected because it does not meet the rules for ${context.table}. ` +
          'Check the values and try again.',
        { cause: error },
      )

    case PG_CODES.insufficientPrivilege:
      // Row-level security refused the row. Not a bug to be worked around:
      // the database is the authorization boundary, and this is it holding.
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

/**
 * Parses rows, reporting a failure as a row-validation error.
 *
 * The client is not generated against the schema, so rows arrive as `unknown`
 * and are validated rather than cast — the same choice as the Excel provider
 * and `supabase-identity.ts`. A renamed or retyped column then surfaces as
 * one clear error naming the table and row, instead of `undefined` spreading
 * through the UI until something unrelated breaks.
 */
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

  // Strict, unlike the Excel provider's tolerant read. A spreadsheet is
  // hand-edited and a bad row there is expected; a row that fails validation
  // after passing the database's own constraints means the schema and this
  // code disagree, and skipping it would hide that.
  if (issues.length > 0) throw new RowValidationError(table, issues)

  return records
}

/** Best effort at naming the offending row, for the diagnostics only. */
function readRowId(row: unknown): { recordId?: string } {
  if (typeof row !== 'object' || row === null) return {}

  const candidate = (row as { code?: unknown; id?: unknown }).code ?? (row as { id?: unknown }).id
  return typeof candidate === 'string' ? { recordId: candidate } : {}
}
