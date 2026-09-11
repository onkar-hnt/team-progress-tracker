import { z } from 'zod'

import type {
  CreateMentorCommentRequest,
  MentorComment,
  UpdateMentorCommentRequest,
} from '@models/index'

/**
 * Translation between `public.feedback` rows and the domain `MentorComment`.
 *
 * The table is named for what it holds and the model for how the application
 * talks about it; `feedback_date` maps to `date` for the same reason
 * `daily_updates.entry_date` does — the column is explicit in SQL, where
 * three different dates are in scope, and the model is read in a context
 * where only one is.
 *
 * `code` is not mapped. The column exists and the database assigns `CMT001`
 * and up, but `MentorComment` has never carried it and no screen shows it, so
 * reading it would add a field nothing consumes.
 */

export const FEEDBACK_COLUMNS =
  'id, developer_id, mentor_id, project_id, task_id, feedback_date, comment, progress_update, blockers, recommendations, created_at, updated_at' as const

export const feedbackRowSchema = z.object({
  id: z.string().min(1),
  developer_id: z.string().min(1),
  mentor_id: z.string().min(1),
  project_id: z.string().nullable(),
  task_id: z.string().nullable(),
  feedback_date: z.string().min(1),
  comment: z.string().min(1),
  progress_update: z.string().nullable(),
  blockers: z.string().nullable(),
  recommendations: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
})

export type FeedbackRow = z.infer<typeof feedbackRowSchema>

function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Record<TKey, TValue> | Record<string, never> {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>)
}

export function toMentorComment(row: FeedbackRow): MentorComment {
  return {
    id: row.id,
    developerId: row.developer_id,
    mentorId: row.mentor_id,
    date: row.feedback_date,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...optional('taskId', row.task_id),
    ...optional('projectId', row.project_id),
    ...optional('progressUpdate', row.progress_update),
    ...optional('blockers', row.blockers),
    ...optional('recommendations', row.recommendations),
  }
}

export interface FeedbackInsert {
  developer_id: string
  mentor_id: string
  project_id: string | null
  task_id: string | null
  feedback_date: string
  comment: string
  progress_update: string | null
  blockers: string | null
  recommendations: string | null
}

/**
 * Builds the insert payload.
 *
 * `id`, `code` and the audit timestamps are omitted so the column defaults and
 * the `updated_at` trigger assign them. A client clock has no business
 * deciding when a row was written.
 */
export function toFeedbackInsert(request: CreateMentorCommentRequest): FeedbackInsert {
  return {
    developer_id: request.developerId,
    mentor_id: request.mentorId,
    project_id: request.projectId ?? null,
    task_id: request.taskId ?? null,
    feedback_date: request.date,
    comment: request.comment.trim(),
    progress_update: blankToNull(request.progressUpdate),
    blockers: blankToNull(request.blockers),
    recommendations: blankToNull(request.recommendations),
  }
}

/**
 * Builds the update payload from the keys the caller actually supplied.
 *
 * Key presence rather than a comparison against `undefined`, matching the
 * task, project and developer mappers: omitting `blockers` leaves them alone,
 * while passing the key explicitly as `undefined` clears them.
 *
 * The `NOT NULL` columns take the additional `!== undefined` guard, because
 * for those the two meanings collapse — there is no way to unset a comment or
 * a date, so an explicit `undefined` can only mean "leave it".
 */
export function toFeedbackUpdate(request: UpdateMentorCommentRequest): Partial<FeedbackInsert> {
  const payload: Partial<FeedbackInsert> = {}

  if ('comment' in request && request.comment !== undefined) {
    payload.comment = request.comment.trim()
  }
  if ('date' in request && request.date !== undefined) payload.feedback_date = request.date
  if ('developerId' in request && request.developerId !== undefined) {
    payload.developer_id = request.developerId
  }
  if ('mentorId' in request && request.mentorId !== undefined) {
    payload.mentor_id = request.mentorId
  }

  // Nullable columns: an explicit undefined clears them.
  if ('taskId' in request) payload.task_id = request.taskId ?? null
  if ('projectId' in request) payload.project_id = request.projectId ?? null
  if ('progressUpdate' in request) payload.progress_update = blankToNull(request.progressUpdate)
  if ('blockers' in request) payload.blockers = blankToNull(request.blockers)
  if ('recommendations' in request) {
    payload.recommendations = blankToNull(request.recommendations)
  }

  return payload
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
