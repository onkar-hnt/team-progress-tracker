import { z } from 'zod'

import { appConfig } from '@config/app.config'
import type { AccessScope } from '@services/auth/index'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

/** Supabase-only soft-delete bin; auth is enforced by RLS, not this module. */

export function isRecycleBinAvailable(): boolean {
  return appConfig.dataSource === 'supabase' && isSupabaseConfigured()
}

/** Delete confirmation text depends on whether soft-delete is available. */
export function describeDeleteOutcome(): string {
  return isRecycleBinAvailable()
    ? 'It moves to Recently deleted, where it can be restored.'
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

function requireClient() {
  if (!isRecycleBinAvailable()) {
    throw new DataSourceUnavailableError(
      'Recently deleted records need the Supabase data source, which is not configured.',
    )
  }

  return getSupabaseClient()
}

type BinTable = 'daily_updates' | 'developers' | 'feedback' | 'mentors' | 'projects' | 'tasks'

const TABLES: Readonly<Record<DeletedRecordKind, BinTable>> = {
  employee: 'developers',
  entry: 'daily_updates',
  feedback: 'feedback',
  mentor: 'mentors',
  project: 'projects',
  task: 'tasks',
}

/** 42703/PGRST204 means soft-delete migration is not applied yet. */
const MISSING_COLUMN_CODES: ReadonlySet<string> = new Set(['42703', 'PGRST204'])

/** FK RESTRICT on destroy: clear dependent bin rows first. */
const FOREIGN_KEY_VIOLATION = '23503'

function mapBinError(error: { code: string; message: string }, fallback: string): DataProviderError {
  if (MISSING_COLUMN_CODES.has(error.code)) {
    return new DataSourceUnavailableError(
      'Deleted records are not set up in this database yet. Apply the migrations in supabase/migrations, then reload.',
      { cause: error },
    )
  }

  if (error.code === FOREIGN_KEY_VIOLATION) {
    return new DataProviderError(
      'Other deleted records still belong to this one. Destroy those first, then try again.',
      { cause: error },
    )
  }

  return new DataProviderError(fallback, { cause: error })
}

const workRowSchema = z.object({
  id: z.string().min(1),
  developer_id: z.string().min(1),
  project_id: z.string().nullable(),
  deleted_at: z.string().min(1),
})

const entryRowSchema = workRowSchema.extend({
  entry_date: z.string().min(1),
  task_title: z.string().min(1),
})

const taskRowSchema = workRowSchema.extend({
  name: z.string().min(1),
  created_date: z.string().nullable(),
  due_date: z.string().nullable(),
})

const feedbackRowSchema = workRowSchema.extend({
  feedback_date: z.string().min(1),
  comment: z.string().nullable(),
  mentor_id: z.string().min(1),
})

const personRowSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  email: z.string().nullable(),
  created_date: z.string().nullable(),
  deleted_at: z.string().min(1),
})

const projectRowSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  client: z.string().nullable(),
  start_date: z.string().nullable(),
  deleted_at: z.string().min(1),
})

/** Six parallel reads so each table runs under its own select policy. */
export async function listDeletedRecords(): Promise<DeletedRecord[]> {
  const client = requireClient()

  const inTheBin = <TTable extends BinTable>(table: TTable, columns: string) =>
    client
      .from(table)
      .select(columns)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

  const [entries, tasks, feedback, employees, mentors, projects] = await Promise.all([
    inTheBin('daily_updates', 'id, developer_id, project_id, entry_date, task_title, deleted_at'),
    inTheBin('tasks', 'id, developer_id, project_id, name, created_date, due_date, deleted_at'),
    inTheBin('feedback', 'id, developer_id, project_id, feedback_date, comment, mentor_id, deleted_at'),
    inTheBin('developers', 'id, code, name, email, created_date, deleted_at'),
    inTheBin('mentors', 'id, code, name, email, created_date, deleted_at'),
    inTheBin('projects', 'id, code, name, client, start_date, deleted_at'),
  ])

  for (const result of [entries, tasks, feedback, employees, mentors, projects]) {
    if (result.error !== null) {
      throw mapBinError(result.error, 'The deleted records could not be read.')
    }
  }

  const parsedEntries = z.array(entryRowSchema).safeParse(entries.data ?? [])
  const parsedTasks = z.array(taskRowSchema).safeParse(tasks.data ?? [])
  const parsedFeedback = z.array(feedbackRowSchema).safeParse(feedback.data ?? [])
  const parsedEmployees = z.array(personRowSchema).safeParse(employees.data ?? [])
  const parsedMentors = z.array(personRowSchema).safeParse(mentors.data ?? [])
  const parsedProjects = z.array(projectRowSchema).safeParse(projects.data ?? [])

  if (
    !parsedEntries.success ||
    !parsedTasks.success ||
    !parsedFeedback.success ||
    !parsedEmployees.success ||
    !parsedMentors.success ||
    !parsedProjects.success
  ) {
    throw new DataProviderError(
      'A deleted record could not be read. The database schema may be ahead of this build.',
      {
        cause:
          parsedEntries.error ??
          parsedTasks.error ??
          parsedFeedback.error ??
          parsedEmployees.error ??
          parsedMentors.error ??
          parsedProjects.error,
      },
    )
  }

  const records: DeletedRecord[] = [
    ...parsedEntries.data.map((row) => ({
      kind: 'entry' as const,
      id: row.id,
      title: row.task_title,
      date: row.entry_date,
      developerId: row.developer_id,
      ...(row.project_id === null ? {} : { projectId: row.project_id }),
      deletedAt: row.deleted_at,
    })),
    ...parsedTasks.data.map((row) => ({
      kind: 'task' as const,
      id: row.id,
      title: row.name,
      date: row.created_date ?? row.due_date ?? row.deleted_at.slice(0, 10),
      developerId: row.developer_id,
      ...(row.project_id === null ? {} : { projectId: row.project_id }),
      deletedAt: row.deleted_at,
    })),
    ...parsedFeedback.data.map((row) => ({
      kind: 'feedback' as const,
      title: summarise(row.comment) ?? 'Feedback',
      id: row.id,
      date: row.feedback_date,
      developerId: row.developer_id,
      authorMentorId: row.mentor_id,
      ...(row.project_id === null ? {} : { projectId: row.project_id }),
      deletedAt: row.deleted_at,
    })),
    ...parsedEmployees.data.map((row) => toRosterRecord('employee', row)),
    ...parsedMentors.data.map((row) => toRosterRecord('mentor', row)),
    ...parsedProjects.data.map((row) => ({
      kind: 'project' as const,
      id: row.id,
      title: row.name,
      detail: row.client ?? row.code,
      ...(row.start_date === null ? {} : { date: row.start_date }),
      deletedAt: row.deleted_at,
    })),
  ]

  return records.sort((left, right) => right.deletedAt.localeCompare(left.deletedAt))
}

function toRosterRecord(
  kind: 'employee' | 'mentor',
  row: z.infer<typeof personRowSchema>,
): DeletedRecord {
  return {
    kind,
    id: row.id,
    title: row.name,
    detail: row.email ?? row.code,
    ...(row.created_date === null ? {} : { date: row.created_date }),
    deletedAt: row.deleted_at,
  }
}

function summarise(comment: string | null): string | null {
  if (comment === null) return null

  const firstLine = comment.split('\n')[0]?.trim() ?? ''

  if (firstLine === '') return null

  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine
}

/** Requires deleted_at set so restore is idempotent when a row is already live. */
export async function restoreRecord(kind: DeletedRecordKind, id: string): Promise<void> {
  const { data, error } = await requireClient()
    .from(TABLES[kind])
    .update({ deleted_at: null })
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id')

  if (error !== null) {
    throw mapBinError(error, `That ${DELETED_RECORD_LABELS[kind].toLowerCase()} could not be restored.`)
  }

  if ((data ?? []).length === 0) {
    throw new DataProviderError(
      'That record is no longer in the bin. Somebody may have restored or destroyed it already.',
    )
  }
}

/** Permanent DELETE; only allowed when deleted_at is set. */
export async function destroyRecord(kind: DeletedRecordKind, id: string): Promise<void> {
  const { data, error } = await requireClient()
    .from(TABLES[kind])
    .delete()
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id')

  if (error !== null) {
    throw mapBinError(
      error,
      `That ${DELETED_RECORD_LABELS[kind].toLowerCase()} could not be destroyed.`,
    )
  }

  if ((data ?? []).length === 0) {
    throw new DataProviderError(
      'That record is no longer in the bin. Somebody may have restored or destroyed it already.',
    )
  }
}
