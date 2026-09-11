import { z } from 'zod'

import type {
  CreateDailyWorkEntryRequest,
  DailyWorkEntry,
  UpdateDailyWorkEntryRequest,
} from '@models/index'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'

import { isIsoDateString } from '../excel/excel-value.utils'

/**
 * Translation between `public.daily_updates` rows and `DailyWorkEntry`.
 *
 * A daily update is the record of what happened on one day, as opposed to a
 * task, which is the plan. That is why several developers may hold entries on
 * the same date and why one developer may log more than one: `entry_date` is
 * not a key and never becomes one, so `id` is the only thing that addresses a
 * row.
 *
 * Unlike every slice before it, this table has no business code. There is
 * nothing for a person to quote — an entry is read in the context of its day
 * and its author, never looked up by reference — so no `DLY001` is invented
 * to fill the gap.
 */

export const DAILY_UPDATE_COLUMNS =
  'id, developer_id, project_id, task_id, entry_date, task_title, description, work_done, planned_work, status, priority, progress, hours_spent, is_blocked, blocker_description, remarks, created_at, updated_at' as const

/**
 * `entry_date` is validated as a real calendar day, not merely as text.
 *
 * The whole date-handling story rests on it: every date filter, and the
 * sort behind the entry lists, compares these values as strings. That is
 * exact for zero-padded `yyyy-MM-dd` and meaningless for anything else, so
 * the shape is checked on the way in rather than assumed.
 */
export const dailyUpdateRowSchema = z.object({
  id: z.string().min(1),
  developer_id: z.string().min(1),
  project_id: z.string().min(1),
  task_id: z.string().nullable(),
  entry_date: z.string().refine(isIsoDateString, { message: 'expected a yyyy-MM-dd date' }),
  task_title: z.string().min(1),
  description: z.string().nullable(),
  work_done: z.string().nullable(),
  planned_work: z.string().nullable(),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  progress: z.number(),
  hours_spent: z.number().nullable(),
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

/**
 * Normalises a `timestamptz` to the form the other providers produce.
 *
 * Note the asymmetry with `entry_date` directly above, which is copied
 * across untouched. A calendar day has no instant attached, so putting one
 * through `Date` would resolve it against the local zone and hand back the
 * previous day to anyone west of UTC — the exact bug this migration must not
 * introduce. A `timestamptz` is the opposite case: it arrives with an
 * explicit offset, so reading it is unambiguous.
 *
 * Worth doing because entries are ordered by `updatedAt` with a string
 * comparison, which needs one format throughout, and PostgREST's
 * `+00:00` with microseconds is not the `Z` with milliseconds that the Excel
 * and mock providers write.
 */
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
  is_blocked: boolean
  blocker_description: string | null
  remarks: string | null
}

/**
 * Builds the insert payload.
 *
 * `id` comes from the column default and the two timestamps from `now()`,
 * so none of the three appear here. A client clock has no business deciding
 * when a row was written, and this is the one place where that matters
 * beyond tidiness: `createdAt` is what tells a mentor an entry was logged
 * late.
 */
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
    is_blocked: request.isBlocked,
    blocker_description: blankToNull(request.blockerDescription),
    remarks: blankToNull(request.remarks),
  }
}

/**
 * Builds the update payload from the keys the caller actually supplied.
 *
 * Key presence rather than a comparison against `undefined`, as in the task,
 * project and developer mappers: omitting `remarks` leaves the column alone,
 * while passing it explicitly as `undefined` clears it.
 *
 * The `NOT NULL` columns take the additional `!== undefined` guard, because
 * for those the two meanings collapse — there is no way to unset a date or a
 * status, so an explicit `undefined` can only mean "leave it".
 */
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
