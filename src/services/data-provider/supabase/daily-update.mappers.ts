import { z } from 'zod'

import type {
  CreateDailyWorkEntryRequest,
  DailyWorkEntry,
  UpdateDailyWorkEntryRequest,
} from '@models/index'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import { isIsoDateString } from '@utils/date.utils'

export const DAILY_UPDATE_COLUMNS =
  'id, developer_id, project_id, task_id, entry_date, task_title, description, work_done, planned_work, status, priority, progress, hours_spent, estimated_hours, is_blocked, blocker_description, remarks, created_at, updated_at' as const

/** PostgREST sends `numeric` as a string so the scale is preserved. */
const jsonNumber = z.union([
  z.number(),
  z
    .string()
    .regex(/^-?\d+(\.\d+)?$/u)
    .transform(Number),
])

const jsonNumberOrNull = z.union([jsonNumber, z.null()])

/** A date column may arrive as `yyyy-MM-dd` or as a timestamp with that prefix. */
const entryDate = z
  .string()
  .transform((value) => value.slice(0, 10))
  .refine(isIsoDateString, { message: 'expected a yyyy-MM-dd date' })

export const dailyUpdateRowSchema = z.object({
  id: z.string().min(1),
  developer_id: z.string().min(1),
  project_id: z.string().min(1),
  task_id: z.string().nullable(),
  entry_date: entryDate,
  task_title: z.string().min(1),
  description: z.string().nullable(),
  work_done: z.string().nullable(),
  planned_work: z.string().nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  progress: jsonNumber,
  hours_spent: jsonNumberOrNull,
  estimated_hours: jsonNumberOrNull,
  is_blocked: z.boolean(),
  blocker_description: z.string().nullable(),
  remarks: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
})

export type DailyUpdateRow = z.infer<typeof dailyUpdateRowSchema>

function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Record<TKey, TValue> | Record<string, never> {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>)
}

function toIsoTimestamp(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

export function toDailyWorkEntry(row: DailyUpdateRow): DailyWorkEntry {
  return {
    id: row.id,
    date: row.entry_date,
    developerId: row.developer_id,
    projectId: row.project_id,
    taskTitle: row.task_title,
    status: row.status,
    priority: row.priority,
    progress: row.progress,
    isBlocked: row.is_blocked,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
    ...optional('taskId', row.task_id),
    ...optional('description', row.description),
    ...optional('workDone', row.work_done),
    ...optional('plannedWork', row.planned_work),
    ...optional('hoursSpent', row.hours_spent),
    ...optional('estimatedHours', row.estimated_hours),
    ...optional('blockerDescription', row.blocker_description),
    ...optional('remarks', row.remarks),
  }
}

export interface DailyUpdateInsert {
  developer_id: string
  project_id: string
  task_id: string | null
  entry_date: string
  task_title: string
  description: string | null
  work_done: string | null
  planned_work: string | null
  status: string
  priority: string
  progress: number
  hours_spent: number | null
  estimated_hours: number | null
  is_blocked: boolean
  blocker_description: string | null
  remarks: string | null
}

export function toDailyUpdateInsert(request: CreateDailyWorkEntryRequest): DailyUpdateInsert {
  return {
    developer_id: request.developerId,
    project_id: request.projectId,
    task_id: request.taskId ?? null,
    entry_date: request.date,
    task_title: request.taskTitle.trim(),
    description: blankToNull(request.description),
    work_done: blankToNull(request.workDone),
    planned_work: blankToNull(request.plannedWork),
    status: request.status,
    priority: request.priority,
    progress: request.progress,
    hours_spent: request.hoursSpent ?? null,
    estimated_hours: request.estimatedHours ?? null,
    is_blocked: request.isBlocked,
    blocker_description: blankToNull(request.blockerDescription),
    remarks: blankToNull(request.remarks),
  }
}

export function toDailyUpdateUpdate(
  request: UpdateDailyWorkEntryRequest,
): Partial<DailyUpdateInsert> {
  const payload: Partial<DailyUpdateInsert> = {}

  if ('developerId' in request && request.developerId !== undefined) {
    payload.developer_id = request.developerId
  }
  if ('projectId' in request && request.projectId !== undefined) {
    payload.project_id = request.projectId
  }
  if ('date' in request && request.date !== undefined) payload.entry_date = request.date
  if ('taskTitle' in request && request.taskTitle !== undefined) {
    payload.task_title = request.taskTitle.trim()
  }
  if ('status' in request && request.status !== undefined) payload.status = request.status
  if ('priority' in request && request.priority !== undefined) payload.priority = request.priority
  if ('progress' in request && request.progress !== undefined) payload.progress = request.progress
  if ('isBlocked' in request && request.isBlocked !== undefined) {
    payload.is_blocked = request.isBlocked
  }

  // Nullable columns: an explicit undefined clears them.
  if ('taskId' in request) payload.task_id = request.taskId ?? null
  if ('description' in request) payload.description = blankToNull(request.description)
  if ('workDone' in request) payload.work_done = blankToNull(request.workDone)
  if ('plannedWork' in request) payload.planned_work = blankToNull(request.plannedWork)
  if ('hoursSpent' in request) payload.hours_spent = request.hoursSpent ?? null
  if ('estimatedHours' in request) payload.estimated_hours = request.estimatedHours ?? null
  if ('blockerDescription' in request) {
    payload.blocker_description = blankToNull(request.blockerDescription)
  }
  if ('remarks' in request) payload.remarks = blankToNull(request.remarks)

  return payload
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
