import { z } from 'zod'

import { apiEndpoints } from '@config/api'
import { apiDelete, apiGet, apiSend } from '@services/api/api-client'
import { describeApiConfigProblem, isApiConfigured } from '@services/api/api-config'
import { ApiConflictError, ApiNotFoundError } from '@services/api/api.errors'
import type { AccessScope } from '@services/auth/index'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'

/** Soft-delete bin backed by the Work service; authorisation is enforced server-side. */

export function isRecycleBinAvailable(): boolean {
  return isApiConfigured()
}

/** Delete confirmation text depends on whether soft-delete is available. */
export function describeDeleteOutcome(): string {
  return isRecycleBinAvailable()
    ? 'It moves to Recently deleted, where it can be restored for fifteen days.'
    : 'This cannot be undone.'
}

export type DeletedRecordKind = 'employee' | 'entry' | 'feedback' | 'mentor' | 'project' | 'task'

export interface DeletedRecord {
  kind: DeletedRecordKind
  id: string
  title: string
  detail?: string
  date?: string
  developerId?: string
  projectId?: string
  authorMentorId?: string
  deletedAt: string
}

/** UI filter only: show restore when UPDATE policy allows it (select is wider than update). */
export function mayActOnDeletedRecord(scope: AccessScope | null, record: DeletedRecord): boolean {
  if (scope === null) return false
  if (scope.role === 'admin') return true

  switch (record.kind) {
    case 'entry':
      return record.developerId !== undefined && record.developerId === scope.developerId

    case 'task':
      return (
        record.developerId !== undefined &&
        scope.mentorId !== undefined &&
        isVisible(scope, record.developerId)
      )

    case 'feedback':
      return scope.mentorId !== undefined && record.authorMentorId === scope.mentorId

    case 'employee':
    case 'mentor':
    case 'project':
      return scope.role === 'mentor'
  }
}

function isVisible(scope: AccessScope, developerId: string): boolean {
  return scope.visibleDeveloperIds === null || scope.visibleDeveloperIds.includes(developerId)
}

export const DELETED_RECORD_LABELS: Readonly<Record<DeletedRecordKind, string>> = {
  employee: 'Employee',
  entry: 'Work entry',
  feedback: 'Feedback',
  mentor: 'Mentor',
  project: 'Project',
  task: 'Task',
}

function requireApi(): void {
  const problem = describeApiConfigProblem()

  if (problem !== null) {
    throw new DataSourceUnavailableError(`The API is not configured. ${problem}`)
  }
}

const deletedRecordKindSchema = z.enum([
  'employee',
  'entry',
  'feedback',
  'mentor',
  'project',
  'task',
])

const deletedRecordDtoSchema = z.object({
  kind: deletedRecordKindSchema,
  id: z.string().min(1),
  title: z.string(),
  deletedAt: z.string().min(1),
  date: z.string().nullable(),
  developerId: z.string().nullable(),
  projectId: z.string().nullable(),
  authorMentorId: z.string().nullable(),
})

function toDeletedRecord(row: z.infer<typeof deletedRecordDtoSchema>): DeletedRecord {
  return {
    kind: row.kind,
    id: row.id,
    title: row.title,
    deletedAt: row.deletedAt,
    ...(row.date === null ? {} : { date: row.date }),
    ...(row.developerId === null ? {} : { developerId: row.developerId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
    ...(row.authorMentorId === null ? {} : { authorMentorId: row.authorMentorId }),
  }
}

function mapBinMutationError(error: unknown, fallback: string): DataProviderError {
  if (error instanceof ApiNotFoundError) {
    return new DataProviderError(
      'That record is no longer in the bin. Somebody may have restored or destroyed it already.',
      { cause: error },
    )
  }

  if (error instanceof ApiConflictError) {
    return new DataProviderError(
      'Other deleted records still belong to this one. Destroy those first, then try again.',
      { cause: error },
    )
  }

  if (error instanceof DataProviderError) return error

  return new DataProviderError(fallback, { cause: error })
}

export async function listDeletedRecords(): Promise<DeletedRecord[]> {
  requireApi()

  const parsed = z.array(deletedRecordDtoSchema).safeParse(await apiGet<unknown>(apiEndpoints.recycleBin.list))

  if (!parsed.success) {
    throw new DataProviderError(
      'A deleted record could not be read. The database schema may be ahead of this build.',
      { cause: parsed.error },
    )
  }

  return parsed.data.map(toDeletedRecord)
}

export async function restoreRecord(kind: DeletedRecordKind, id: string): Promise<void> {
  requireApi()

  try {
    // Answers with a message and no payload, so the envelope carries no data.
    await apiSend('POST', apiEndpoints.recycleBin.restore(kind, id))
  } catch (error) {
    throw mapBinMutationError(
      error,
      `That ${DELETED_RECORD_LABELS[kind].toLowerCase()} could not be restored.`,
    )
  }
}

/** Permanent delete; only allowed while the row is still soft-deleted. */
export async function destroyRecord(kind: DeletedRecordKind, id: string): Promise<void> {
  requireApi()

  try {
    await apiDelete(apiEndpoints.recycleBin.purge(kind, id))
  } catch (error) {
    throw mapBinMutationError(
      error,
      `That ${DELETED_RECORD_LABELS[kind].toLowerCase()} could not be destroyed.`,
    )
  }
}
