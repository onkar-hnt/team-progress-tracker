import { z } from 'zod'

import type {
  AssignedTask,
  CreateAssignedTaskRequest,
  UpdateAssignedTaskRequest,
} from '@models/index'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'

/**
 * Translation between `public.tasks` rows and the domain `AssignedTask`.
 *
 * A task is the *plan* — assigned by an admin, with a due date, living until
 * it is finished — as opposed to a daily update, which is the record of what
 * happened on one day. That distinction is why `created_date` and `due_date`
 * are plain calendar days while `updated_at` is a full timestamp: the first
 * two are things a person schedules, the last is when a row was touched.
 *
 * `mentor_id` is stored on the task rather than inferred from the current
 * mentor mapping, so that reassigning a developer to a new mentor does not
 * silently rewrite who was accountable for work already assigned.
 */

export const TASK_COLUMNS =
  'id, code, name, description, project_id, developer_id, mentor_id, priority, status, created_date, due_date, updated_at' as const

export const taskRowSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  project_id: z.string().min(1),
  developer_id: z.string().min(1),
  mentor_id: z.string().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  created_date: z.string().min(1),
  due_date: z.string().nullable(),
  updated_at: z.string().min(1),
})

export type TaskRow = z.infer<typeof taskRowSchema>

function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Record<TKey, TValue> | Record<string, never> {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>)
}

export function toAssignedTask(row: TaskRow): AssignedTask {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    projectId: row.project_id,
    developerId: row.developer_id,
    priority: row.priority,
    status: row.status,
    createdDate: row.created_date,
    updatedAt: row.updated_at,
    ...optional('description', row.description),
    ...optional('mentorId', row.mentor_id),
    ...optional('dueDate', row.due_date),
  }
}

export interface TaskInsert {
  name: string
  description: string | null
  project_id: string
  developer_id: string
  mentor_id: string | null
  priority: string
  status: string
  created_date: string
  due_date: string | null
}

/**
 * Builds the insert payload.
 *
 * `id` and `code` are omitted so the column defaults assign them, and
 * `updated_at` is left to the database as well — a client clock has no
 * business deciding when a row was written. A `code` on the request is
 * ignored rather than honoured.
 */
export function toTaskInsert(request: CreateAssignedTaskRequest): TaskInsert {
  return {
    name: request.name.trim(),
    description: blankToNull(request.description),
    project_id: request.projectId,
    developer_id: request.developerId,
    mentor_id: request.mentorId ?? null,
    priority: request.priority,
    status: request.status,
    created_date: request.createdDate,
    due_date: blankToNull(request.dueDate),
  }
}

/**
 * Builds the update payload from the keys the caller actually supplied.
 *
 * Key presence rather than a comparison against `undefined`, matching the
 * project and developer mappers: omitting `dueDate` leaves the date alone,
 * while passing it explicitly as `undefined` clears it.
 *
 * The `NOT NULL` columns take the additional `!== undefined` guard, because
 * for those the two meanings collapse — there is no way to unset a name or a
 * status, so an explicit `undefined` can only mean "leave it".
 */
export function toTaskUpdate(request: UpdateAssignedTaskRequest): Partial<TaskInsert> {
  const payload: Partial<TaskInsert> = {}

  if ('name' in request && request.name !== undefined) payload.name = request.name.trim()
  if ('projectId' in request && request.projectId !== undefined) {
    payload.project_id = request.projectId
  }
  if ('developerId' in request && request.developerId !== undefined) {
    payload.developer_id = request.developerId
  }
  if ('priority' in request && request.priority !== undefined) payload.priority = request.priority
  if ('status' in request && request.status !== undefined) payload.status = request.status
  if ('createdDate' in request && request.createdDate !== undefined) {
    payload.created_date = request.createdDate
  }

  // Nullable columns: an explicit undefined clears them.
  if ('description' in request) payload.description = blankToNull(request.description)
  if ('mentorId' in request) payload.mentor_id = request.mentorId ?? null
  if ('dueDate' in request) payload.due_date = blankToNull(request.dueDate)

  return payload
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
