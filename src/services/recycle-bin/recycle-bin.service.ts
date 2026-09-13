import { z } from 'zod'

import { appConfig } from '@config/app.config'
import type { AccessScope } from '@services/auth/index'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

/**
 * What has been deleted, and putting it back.
 *
 * ## Why this sits outside `DataProvider`
 *
 * The same argument as notifications and accounts. `DataProvider` is the seam that
 * makes the record store replaceable, and only one of its three implementations
 * keeps what it deletes: the Excel and fixture providers remove the row outright,
 * because a spreadsheet has no trigger to record who did it and no policy to
 * decide who may undo it. Putting a bin on that interface would mean two
 * implementations that throw and a capability flag to ask before calling.
 *
 * So this is a Supabase feature and says so, through `isRecycleBinAvailable`. The
 * screen shows a placeholder under the other data sources rather than an empty bin
 * that could never fill.
 *
 * ## Where the authorization is
 *
 * Entirely in the database, and unchanged by this file. Reads run under each
 * table's own select policy, so the bin shows a developer their own deleted
 * entries, a mentor those of the developers assigned to them, and an administrator
 * everything. Restoring and destroying run under the UPDATE and DELETE policies,
 * which admit the same people they always did — see
 * `20260913200000_soft_delete.sql` and `20260913220000_soft_delete_roster.sql`.
 *
 * A caller cannot ask for somebody else's deleted work, because the request
 * carries no way to name them.
 *
 * `mayActOnDeletedRecord` is the one thing here that reads like a permission
 * check, and it is not one: reading and restoring are not open to the same people,
 * so it decides what a bin is worth showing rather than what may happen. See its
 * own note.
 */

export function isRecycleBinAvailable(): boolean {
  return appConfig.dataSource === 'supabase' && isSupabaseConfigured()
}

/**
 * How a delete confirmation ends its sentence.
 *
 * The three delete dialogs used to close with "This cannot be undone", which was
 * true when they said it and is now the opposite of what happens. Shared from
 * here, rather than each page deciding, because the answer is a property of the
 * data source and not of the screen — and because a bin nobody is told about is
 * a bin nobody looks in.
 *
 * Still conditional: the workbook and fixture providers remove the row outright,
 * so under those the old sentence is the correct one.
 */
export function describeDeleteOutcome(): string {
  return isRecycleBinAvailable()
    ? 'It moves to Recently deleted, where it can be restored.'
    : 'This cannot be undone.'
}

/**
 * Which table a deleted record came from.
 *
 * Named for the domain rather than the table, because this reaches the interface:
 * "Work entry" is what somebody deleted, `daily_updates` is where it lives.
 *
 * Six, in two groups that behave differently in one respect worth knowing here:
 * the three work records can always be deleted, while an employee, a mentor or a
 * project can only be deleted when nothing live references it. So the roster half
 * of this bin holds records that were removed shortly after being created, which
 * is exactly the mistake it exists to undo.
 */
export type DeletedRecordKind = 'employee' | 'entry' | 'feedback' | 'mentor' | 'project' | 'task'

export interface DeletedRecord {
  kind: DeletedRecordKind
  id: string

  /** The one line that identifies it in a list: a person's name, a task title. */
  title: string

  /**
   * A second line's worth of identification, for the records that need one: an
   * email address, a client. Absent for the work records, where what identifies
   * them is who and what they were for, and only a screen holding the roster can
   * turn those ids into names.
   */
  detail?: string

  /**
   * The day the record is about, which is not the day it was deleted.
   *
   * Optional, because a roster record does not have to have one: an employee added
   * without a start date, a project with no dates yet.
   */
  date?: string

  /** Absent on the roster records, which are not about one person's work. */
  developerId?: string
  projectId?: string

  /** Who wrote it, for feedback. Absent on the rest, which have no author. */
  authorMentorId?: string

  deletedAt: string
}

/**
 * Whether this person's bin should hold this record.
 *
 * Reading a deleted row and restoring one do not admit the same people, which is
 * the whole reason this exists. `daily_updates_select` and `feedback_select` are
 * written around `can_view_developer`, so a developer can see a task or a comment
 * about them that a mentor deleted — but `tasks_update` and `feedback_update` are
 * not, so they could not put either back. Offering the button anyway would produce
 * an update matching no row and a message about somebody else having got there
 * first, which is not what happened.
 *
 * So a bin holds what its owner can undo, and each clause mirrors the UPDATE and
 * DELETE policies for that table:
 *
 *   * an entry — an administrator, or the developer whose entry it is;
 *   * a task — an administrator, or a mentor of that developer;
 *   * feedback — an administrator, or the mentor who wrote it;
 *   * an employee, a mentor or a project — `is_privileged()`, which is an
 *     administrator or any mentor, since maintaining the roster is not narrowed to
 *     the developers a mentor is assigned.
 *
 * A copy of the policies, and stated as such. It decides what is shown and never
 * what is allowed: the request still runs under the policies, and if this drifts
 * the database refuses. Which is why it is here beside the reads rather than in
 * `@services/auth` among the rules the application enforces.
 */
export function mayActOnDeletedRecord(scope: AccessScope | null, record: DeletedRecord): boolean {
  if (scope === null) return false
  if (scope.role === 'admin') return true

  switch (record.kind) {
    case 'entry':
      // Compared only when the record names somebody, so that two absent ids
      // cannot pass for a match. The three work kinds always do name one; the type
      // allows for the roster kinds, which are handled below.
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

/** How the bin describes each kind, in one place because three screens say it. */
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

/**
 * The table each kind lives in.
 *
 * The only place the mapping is written. Everything else in this file takes a
 * `DeletedRecordKind`, so a caller cannot name a table — and the union is what
 * stops one being smuggled in from a URL.
 */
type BinTable = 'daily_updates' | 'developers' | 'feedback' | 'mentors' | 'projects' | 'tasks'

const TABLES: Readonly<Record<DeletedRecordKind, BinTable>> = {
  employee: 'developers',
  entry: 'daily_updates',
  feedback: 'feedback',
  mentor: 'mentors',
  project: 'projects',
  task: 'tasks',
}

/**
 * A missing column means the migration has not been applied.
 *
 * `42703` is Postgres on an unknown column and `PGRST204` is PostgREST's schema
 * cache saying the same thing. Worth naming outright: the generic wording sends
 * whoever hit it looking for a network fault instead of a pending deploy.
 */
const MISSING_COLUMN_CODES: ReadonlySet<string> = new Set(['42703', 'PGRST204'])

/**
 * Something still points at the row, which only destroying can hit.
 *
 * The `RESTRICT` foreign keys into the roster tables, doing what they have always
 * done. It happens in one situation and is worth explaining precisely: an employee
 * was deleted while the only work naming them was itself in the bin, and destroying
 * them now would leave those entries pointing at nothing. Emptying the bin in the
 * other order works.
 */
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

/** The roster rows, which are identified by a name and a code rather than by a day. */
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

/**
 * Everything the caller may see that has been deleted, newest first.
 *
 * Six reads rather than one. A single query would need a view or a function
 * unioning six tables of different shapes, and both would have to re-state the six
 * select policies rather than run under them — which is the one thing worth
 * avoiding here. Six requests for a screen somebody opens rarely is the cheaper
 * mistake, and they go out together.
 *
 * A table that has not had the migration applied yet fails the whole read rather
 * than returning part of a bin: a bin that silently omits a category is worse than
 * one that says it is not available.
 */
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
      // A task's own date is when it was raised, falling back to when it is due:
      // one of the two is always set, and either answers "which task was this".
      date: row.created_date ?? row.due_date ?? row.deleted_at.slice(0, 10),
      developerId: row.developer_id,
      ...(row.project_id === null ? {} : { projectId: row.project_id }),
      deletedAt: row.deleted_at,
    })),
    ...parsedFeedback.data.map((row) => ({
      kind: 'feedback' as const,
      // The comment is the record, so its first line is what identifies it.
      // Truncated here rather than in the table, because a paragraph in a cell is
      // a layout problem and the full text is not what a bin is for.
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
      // The client, or the code, so a bin holding two projects with similar names
      // still tells them apart.
      detail: row.client ?? row.code,
      ...(row.start_date === null ? {} : { date: row.start_date }),
      deletedAt: row.deleted_at,
    })),
  ]

  // Sorted here rather than by the database, because six ordered reads do not
  // arrive as one ordered list.
  return records.sort((left, right) => right.deletedAt.localeCompare(left.deletedAt))
}

/** An employee and a mentor differ only in which table they came from. */
function toRosterRecord(
  kind: 'employee' | 'mentor',
  row: z.infer<typeof personRowSchema>,
): DeletedRecord {
  return {
    kind,
    id: row.id,
    title: row.name,
    // The address is what tells two people with the same name apart, and it is
    // also what somebody re-adding them needs to know is now free.
    detail: row.email ?? row.code,
    ...(row.created_date === null ? {} : { date: row.created_date }),
    deletedAt: row.deleted_at,
  }
}

/** The first line of a comment, short enough for a table cell. */
function summarise(comment: string | null): string | null {
  if (comment === null) return null

  const firstLine = comment.split('\n')[0]?.trim() ?? ''

  if (firstLine === '') return null

  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine
}

/**
 * Puts a record back.
 *
 * `.not('deleted_at', 'is', null)` so restoring something a colleague has already
 * restored reports that there was nothing to do, rather than writing null over
 * null and claiming success.
 */
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

/**
 * Destroys a record for good.
 *
 * A real DELETE, and the only one left in the application for these six tables. It
 * runs under the same policy that used to serve the delete button, so nobody gains
 * a power here — the difference is that it now takes two deliberate acts on two
 * screens instead of one click on the row.
 *
 * Being a real DELETE is also where the schema's own delete actions finally apply:
 * destroying a project takes its team list with it and lets go of the feedback that
 * named it, exactly as deleting one did before any of this existed.
 *
 * `deleted_at` is required to be set, so this cannot be aimed at a live record
 * even by a caller assembling the request by hand.
 */
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
