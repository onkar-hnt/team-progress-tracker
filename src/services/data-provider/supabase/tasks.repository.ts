import type {
  AssignedTask,
  AssignedTaskQuery,
  CreateAssignedTaskRequest,
  UpdateAssignedTaskRequest,
} from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'

import { RecordNotFoundError } from '../data-provider.errors'
import { assertDeveloperExists, assertMentorExists, assertProjectExists } from './references'
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
 * false. Sending it to PostgREST as `in.()` would rely on how the server
 * treats an empty set, so the answer is given here instead — and it saves a
 * request. This is a real case, not a defensive one: a mentor with no
 * assigned developers has exactly this scope.
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

  // Each filter method returns the same builder, so the query is assembled
  // by reassignment rather than by casting between shapes.
  let builder = client.from('tasks').select(TASK_COLUMNS)

  if (query?.developerIds !== undefined) {
    builder = builder.in('developer_id', [...query.developerIds])
  }

  // A task with no mentor matches no list of mentor ids, which `IN` gives
  // for free: null never satisfies it.
  if (query?.mentorIds !== undefined) builder = builder.in('mentor_id', [...query.mentorIds])
  if (query?.projectIds !== undefined) builder = builder.in('project_id', [...query.projectIds])
  if (query?.statuses !== undefined) builder = builder.in('status', [...query.statuses])
  if (query?.priorities !== undefined) builder = builder.in('priority', [...query.priorities])

  // Likewise, a task with no due date can never be overdue, and `<=` excludes
  // nulls rather than treating them as due immediately.
  if (query?.dueOnOrBefore !== undefined) builder = builder.lte('due_date', query.dueOnOrBefore)

  const { data, error } = await builder

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

  if (Object.keys(payload).length === 0) return requireTask(client, id)

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

export async function deleteTaskRow(client: AppSupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from('tasks').delete().eq('id', id).select('id')

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Tasks', operation: 'delete', recordId: id })
  }

  if ((data ?? []).length === 0) throw new RecordNotFoundError('Tasks', id)
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
