import { z } from 'zod'

import type { CreateLeaveDayRequest, LeaveDay } from '@models/index'
import { isIsoDateString } from '@utils/date/date.utils'

export const LEAVE_DAY_COLUMNS =
  'id, developer_id, leave_date, note, recorded_by, created_at' as const

/** A date column may arrive as `yyyy-MM-dd` or as a timestamp with that prefix. */
const leaveDate = z
  .string()
  .transform((value) => value.slice(0, 10))
  .refine(isIsoDateString, { message: 'expected a yyyy-MM-dd date' })

export const leaveDayRowSchema = z.object({
  id: z.string().min(1),
  developer_id: z.string().min(1),
  leave_date: leaveDate,
  note: z.string().nullable(),
  recorded_by: z.string().nullable(),
  created_at: z.string().min(1),
})

export type LeaveDayRow = z.infer<typeof leaveDayRowSchema>

export function toLeaveDay(row: LeaveDayRow): LeaveDay {
  return {
    id: row.id,
    developerId: row.developer_id,
    date: row.leave_date,
    createdAt: toIsoTimestamp(row.created_at),
    ...(row.note === null ? {} : { note: row.note }),
    ...(row.recorded_by === null ? {} : { recordedBy: row.recorded_by }),
  }
}

export interface LeaveDayInsert {
  developer_id: string
  leave_date: string
  note: string | null
}

/**
 * `recorded_by` is left out on purpose: the column defaults to the caller, and
 * the insert policy refuses any other value. A row this sends is a statement
 * about a day, not about who is making it.
 */
export function toLeaveDayInsert(request: CreateLeaveDayRequest): LeaveDayInsert {
  const note = request.note?.trim() ?? ''

  return {
    developer_id: request.developerId,
    leave_date: request.date,
    note: note === '' ? null : note,
  }
}

function toIsoTimestamp(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}
