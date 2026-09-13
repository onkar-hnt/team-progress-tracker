import type {
  AssignedTask,
  AssignedTaskQuery,
  CreateAssignedTaskRequest,
  UpdateAssignedTaskRequest,
} from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'

import { RecordNotFoundError } from '../data-provider.errors'
import { assertDeveloperExists, assertMentorExists, assertProjectExists } from './references'
import { filterList } from './rpc-params'
import { softDeleteRow } from './soft-delete'
import { mapPostgrestError, parseRows } from './supabase-errors'
import { TASK_COLUMNS, taskRowSchema, toAssignedTask, toTaskInsert, toTaskUpdate } from './task.mappers'

/**
 * `public.tasks`: work assigned to a developer.
 *
 * Unlike the earlier slices this one filters at source. The query the
 * interface already defines maps cleanly onto SQL, and the schema carries
 * indexes built for exactly these predicates — `tasks_developer_status_idx`
 * and `tasks_due_date_idx` — which only earn their keep if the filtering
 * reaches the database.
 *
 * The filtered read goes through `list_tasks` rather than a filter chain, for
 * the reasons recorded in `20260913060000_filtered_list_functions.sql`. Every
 * other statement here is a single-row lookup or a write, and stays an
 * ordinary PostgREST call: there is nothing about `where id = …` that a
 * function would express better.
 *
 * The translation must agree with `matchesTaskQuery`, the in-memory
 * evaluation both other providers use. `WorkTrackerService` re-applies the
 * developer filter over whatever comes back, so a mistake here could not
 * widen a result beyond the caller's scope, but it could still narrow one
 * wrongly, and the two implementations are checked against each other during
 * verification.
 */

/**
 * An empty list in the query means "nothing matches".
 *
 * `matchesTaskQuery` reaches that answer naturally, since `[].includes(x)` is
 * false. Asking the database instead would rely on the difference between an
 * empty list and no list surviving the round trip, so the answer is given
 * here — and it saves a request. This is a real case, not a defensive one: a
 * mentor with no assigned developers has exactly this scope.
 */
function matchesNothing(query: AssignedTaskQuery): boolean {
  return (
    query.developerIds?.length === 0 ||
    query.mentorIds?.length === 0 ||
    query.projectIds?.length === 0 ||
    query.statuses?.length === 0 ||
    query.priorities?.length === 0
  )
}

export async function selectTasks(
  client: AppSupabaseClient,
  query?: AssignedTaskQuery,
): Promise<AssignedTask[]> {
  if (query !== undefined && matchesNothing(query)) return []

  // A task with no mentor matches no list of mentor ids, and one with no due
  // date is never past one. Both fall out of how the function compares them —
  // null satisfies neither `= any (…)` nor `<=` — rather than needing a case
  // here, which is the same thing the filter chain relied on.
  const request = client.rpc('list_tasks', {
    p_developer_ids: filterList(query?.developerIds),
    p_mentor_ids: filterList(query?.mentorIds),
    p_project_ids: filterList(query?.projectIds),
    p_statuses: filterList(query?.statuses),
    p_priorities: filterList(query?.priorities),
    p_due_on_or_before: query?.dueOnOrBefore ?? null,
  })

  // Most recently updated first, which is the order the task lists draw and the
  // order `AssignedTaskQuery.limit` promises. Added to the select over the function
  // rather than inside it, so one definition serves the paged and unpaged reads.
  const { data, error } =
    query?.limit === undefined
      ? await request
      : await request
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(query.limit)

  if (error !== null) throw mapPostgrestError(error, { table: 'Tasks', operation: 'read' })

  return parseRows('Tasks', taskRowSchema, data ?? [], toAssignedTask)
}

/** Resolves to `null` when no task carries that id, as the interface states. */
export async function selectTaskById(
  client: AppSupabaseClient,
  id: string,
): Promise<AssignedTask | null> {
  const { data, error } = await client
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('id', id)
    // A deleted task is not readable by id either. Only the bin sees those, by a
    // path of its own.
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Tasks', operation: 'read', recordId: id })
  }

  if (data === null) return null

  return parseRows('Tasks', taskRowSchema, [data], toAssignedTask)[0]!
}

export async function insertTask(
  client: AppSupabaseClient,
  request: CreateAssignedTaskRequest,
): Promise<AssignedTask> {
  await assertTaskReferences(client, request)

  const { data, error } = await client
    .from('tasks')
    .insert(toTaskInsert(request))
    .select(TASK_COLUMNS)
    .single()

  if (error !== null) throw mapPostgrestError(error, { table: 'Tasks', operation: 'insert' })

  return parseRows('Tasks', taskRowSchema, [data], toAssignedTask)[0]!
}

export async function updateTaskRow(
  client: AppSupabaseClient,
  id: string,
  request: UpdateAssignedTaskRequest,
): Promise<AssignedTask> {
  await assertTaskReferences(client, request)

  const payload = toTaskUpdate(request)
  const changed = Object.keys(payload)

  if (changed.length === 0) return requireTask(client, id)

  // A developer may change the status of their own task and nothing else — a
  // distinction row-level security cannot draw, because a policy is evaluated
  // per row and sees no columns. So a status-only edit goes through
  // `set_task_status`, which checks the caller and writes just that column,
  // while every other edit takes the direct path where `tasks_update` now
  // admits only admins and mentors.
  if (changed.length === 1 && payload.status !== undefined) {
    return setTaskStatus(client, id, payload.status)
  }

  const { data, error } = await client
    .from('tasks')
    .update(payload)
    .eq('id', id)
    .select(TASK_COLUMNS)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Tasks', operation: 'update', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Tasks', id)

  return parseRows('Tasks', taskRowSchema, [data], toAssignedTask)[0]!
}

/**
 * Moves a task along, as the assignee, their mentor, or an admin.
 *
 * The function returns the whole row, so the result is parsed with the same
 * schema a select goes through rather than trusted because it came from a
 * write. It returns null for a task that does not exist, which is reported
 * here as the not-found it is; a caller who may not touch an existing task
 * gets a privilege error from the function instead, which the error mapper
 * turns into "you do not have permission to change this record".
 */
async function setTaskStatus(
  client: AppSupabaseClient,
  id: string,
  // `string` rather than `TaskStatus`, matching the insert payload: this is a
  // column value on its way to a `text` parameter, and the table's check
  // constraint is what decides which values are legal.
  status: string,
): Promise<AssignedTask> {
  const { data, error } = await client.rpc('set_task_status', {
    target_task_id: id,
    new_status: status,
  })

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Tasks', operation: 'update', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Tasks', id)

  return parseRows('Tasks', taskRowSchema, [data], toAssignedTask)[0]!
}

/**
 * Puts a task aside rather than destroying it.
 *
 * The daily updates logged against it are left exactly as they are, still naming
 * it. They are a record of work that happened, and they still resolve the task's
 * title — a report of last month must not develop gaps because somebody tidied up
 * afterwards. See `soft-delete.ts`.
 */
export async function deleteTaskRow(client: AppSupabaseClient, id: string): Promise<void> {
  await softDeleteRow(client, 'tasks', id)
}

async function requireTask(client: AppSupabaseClient, id: string): Promise<AssignedTask> {
  const task = await selectTaskById(client, id)
  if (task === null) throw new RecordNotFoundError('Tasks', id)
  return task
}

/**
 * Checks the references a task makes, for whichever of them are being set.
 *
 * A clearing `mentorId` is skipped rather than looked up: `undefined` means
 * "no mentor", and there is nothing to confirm the existence of.
 */
async function assertTaskReferences(
  client: AppSupabaseClient,
  request: {
    developerId?: string | undefined
    projectId?: string | undefined
    mentorId?: string | undefined
  },
): Promise<void> {
  if (request.developerId !== undefined) await assertDeveloperExists(client, request.developerId)
  if (request.projectId !== undefined) await assertProjectExists(client, request.projectId)
  if (request.mentorId !== undefined) await assertMentorExists(client, request.mentorId)
}
