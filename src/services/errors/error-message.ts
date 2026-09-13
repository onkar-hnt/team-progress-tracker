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
import { ProvisioningError } from '@services/provisioning/provision-login'

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

  if (error instanceof RecordInUseError) {
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

  if (error instanceof DataProviderError || error instanceof AuthError) return error.message

  if (error instanceof ProvisioningError) return error.message

  return fallback
}

export function logFailure(context: string, error: unknown): void {
  console.error(`[${context}]`, error)
}
