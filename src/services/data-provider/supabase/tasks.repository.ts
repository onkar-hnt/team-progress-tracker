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

  const request = client.rpc('list_tasks', {
    p_developer_ids: filterList(query?.developerIds),
    p_mentor_ids: filterList(query?.mentorIds),
    p_project_ids: filterList(query?.projectIds),
    p_statuses: filterList(query?.statuses),
    p_priorities: filterList(query?.priorities),
    p_due_on_or_before: query?.dueOnOrBefore ?? null,
  })

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

async function setTaskStatus(
  client: AppSupabaseClient,
  id: string,
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

export async function deleteTaskRow(client: AppSupabaseClient, id: string): Promise<void> {
  await softDeleteRow(client, 'tasks', id)
}

async function requireTask(client: AppSupabaseClient, id: string): Promise<AssignedTask> {
  const task = await selectTaskById(client, id)
  if (task === null) throw new RecordNotFoundError('Tasks', id)
  return task
}

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
