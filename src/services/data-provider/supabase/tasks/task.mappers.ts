import { z } from 'zod'

import type {
  AssignedTask,
  CreateAssignedTaskRequest,
  UpdateAssignedTaskRequest,
} from '@models/index'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'

export const TASK_COLUMNS =
  'id, code, name, description, project_id, developer_id, mentor_id, priority, status, created_date, due_date, estimated_hours, worked_days, actual_hours, updated_at' as const

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
  estimated_hours: z.number().nullable(),
  worked_days: z.number(),
  actual_hours: z.number(),
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
    workedDays: row.worked_days,
    actualHours: row.actual_hours,
    updatedAt: row.updated_at,
    ...optional('description', row.description),
    ...optional('mentorId', row.mentor_id),
    ...optional('dueDate', row.due_date),
    ...optional('estimatedHours', row.estimated_hours),
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
  estimated_hours: number | null
}

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
    estimated_hours: request.estimatedHours ?? null,
  }
}

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
  if ('estimatedHours' in request) payload.estimated_hours = request.estimatedHours ?? null

  return payload
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
