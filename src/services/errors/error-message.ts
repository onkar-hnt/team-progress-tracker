import { AuthError } from '@services/auth/auth.errors'
import {
  DataProviderError,
  DuplicateRecordError,
  RecordInUseError,
  RecordNotFoundError,
  ReferentialIntegrityError,
  RowValidationError,
  SchemaMismatchError,
} from '@services/data-provider/data-provider.errors'
import type { ReferenceField } from '@services/data-provider/data-provider.errors'

/**
 * The one place a failure is turned into a sentence for the person who caused
 * it.
 *
 * Three copies of this decision existed before — two `describeFailure`
 * functions in the Admin workbook service and its initialisation log, and a
 * `reportError` inside the login screen — each written as `error instanceof
 * DataProviderError ? error.message : 'something went wrong'`. That test is
 * right about the common case and wrong about the rest of the taxonomy: some of
 * those errors carry a table name, a constraint or a uuid in their message,
 * because they were written for whoever is reading the console.
 *
 * So this is not a fallback chain but a translation. Anything unrecognised gets
 * the caller's own wording, which is why `fallback` is required rather than
 * defaulted: only the caller knows what was being attempted, and "Unable to
 * save the task" is worth more than a generic apology.
 *
 * The technical detail is never destroyed, only kept out of the interface —
 * every mapped error still holds the original as `cause`, and `logFailure`
 * below is what puts it where a developer can read it.
 */

const REFERENCE_LABELS: Readonly<Record<ReferenceField, string>> = {
  developerId: 'employee',
  mentorId: 'mentor',
  projectId: 'project',
  taskId: 'task',
}

/** What to say when the data itself is the problem rather than the request. */
const STRUCTURE_PROBLEM =
  'The data could not be read because it does not match the expected structure. ' +
  'Ask an administrator to check the setup.'

const STALE_RECORD = 'That record no longer exists. Refresh the page and try again.'

export function toUserMessage(error: unknown, fallback: string): string {
  // Subclasses first: every one of these extends `DataProviderError`, and the
  // base case below would otherwise answer for all of them.

  if (error instanceof RecordInUseError) {
    // Rewritten rather than passed through. The error's own message opens with
    // the record's uuid, which is meaningful in a log and meaningless in a
    // dialog — but the list of what depends on it is exactly what the reader
    // needs in order to act.
    return (
      `This cannot be deleted because it is still used by ${error.dependents.join(', ')}. ` +
      'Remove or reassign those first, or mark this record inactive instead.'
    )
  }

  if (error instanceof ReferentialIntegrityError) {
    return (
      `That change points at a ${REFERENCE_LABELS[error.field]} which no longer exists. ` +
      'Refresh the page and try again.'
    )
  }

  if (error instanceof RecordNotFoundError) return STALE_RECORD

  if (error instanceof RowValidationError || error instanceof SchemaMismatchError) {
    return STRUCTURE_PROBLEM
  }

  if (error instanceof DuplicateRecordError) {
    return (
      'Two records share the same identifier, so this could not be completed. ' +
      'Ask an administrator to check the data.'
    )
  }

  // Everything remaining in the taxonomy is already written for a reader:
  // `mapPostgrestError` phrases the cases it recognises, and
  // `DataSourceUnavailableError`, `ReadOnlyDataSourceError` and
  // `WorkbookRowNotFoundError` explain a situation rather than a fault.
  if (error instanceof DataProviderError || error instanceof AuthError) return error.message

  return fallback
}

/**
 * Puts the technical detail in the console, where it is of use.
 *
 * Called alongside `toUserMessage` rather than inside it, because a message is
 * also built for things that are not failures to investigate — a validation
 * warning, say — and logging from a formatting function would make that
 * impossible to avoid.
 *
 * The error object is passed whole rather than stringified so the browser's own
 * inspector can walk the `cause` chain down to the original `PostgrestError`,
 * with its SQLSTATE and constraint name intact.
 */
export function logFailure(context: string, error: unknown): void {
  console.error(`[${context}]`, error)
}
