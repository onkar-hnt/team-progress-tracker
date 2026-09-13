import type {
  CreateMentorCommentRequest,
  MentorComment,
  MentorCommentQuery,
  UpdateMentorCommentRequest,
} from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'

import { RecordNotFoundError } from '../data-provider.errors'
import {
  FEEDBACK_COLUMNS,
  feedbackRowSchema,
  toFeedbackInsert,
  toFeedbackUpdate,
  toMentorComment,
} from './feedback.mappers'
import { assertDeveloperExists, assertMentorExists, assertProjectExists, assertTaskExists } from './references'
import { filterList } from './rpc-params'
import { softDeleteRow } from './soft-delete'
import { mapPostgrestError, parseRows } from './supabase-errors'

/**
 * `public.feedback`: what a mentor recorded about a developer's work.
 *
 * The last slice to move off the fixtures, and the one where doing so matters
 * most to whoever is using the application: a mentor writing feedback into an
 * in-memory provider lost it on the next reload, which is the opposite of
 * what a mentoring record is for.
 *
 * Filters at source like tasks and daily updates, over
 * `feedback_developer_date_idx`, `feedback_mentor_id_idx` and
 * `feedback_project_id_idx`, and through `list_feedback` for the same reasons
 * as those two — see `20260913060000_filtered_list_functions.sql`. The
 * translation must agree with `matchesCommentQuery`, the in-memory evaluation
 * the other providers share: `WorkTrackerService` re-applies the developer
 * predicate over whatever comes back, so a mistake here could not widen a
 * result past the caller's scope, but it could still narrow one wrongly.
 */

/**
 * An empty list in the query means "nothing matches".
 *
 * `matchesCommentQuery` reaches that answer naturally, since `[].includes(x)`
 * is false. Asking the database instead would rely on the difference between
 * an empty list and no list surviving the round trip, so the answer is given
 * here — and it saves a request. A mentor with no assigned developers has
 * exactly this scope.
 */
function matchesNothing(query: MentorCommentQuery): boolean {
  return (
    query.developerIds?.length === 0 ||
    query.mentorIds?.length === 0 ||
    query.projectIds?.length === 0
  )
}

export async function selectComments(
  client: AppSupabaseClient,
  query?: MentorCommentQuery,
): Promise<MentorComment[]> {
  if (query !== undefined && matchesNothing(query)) return []

  // Bounds are inclusive, matching the `<`/`>` rejections in the in-memory
  // version. General feedback carries no project and is excluded by a project
  // filter without a case for it, because null satisfies no list — which is
  // what `matchesCommentQuery` does explicitly when it rejects an undefined
  // `projectId` against a requested list.
  const { data, error } = await client.rpc('list_feedback', {
    p_date_from: query?.dateFrom ?? null,
    p_date_to: query?.dateTo ?? null,
    p_developer_ids: filterList(query?.developerIds),
    p_mentor_ids: filterList(query?.mentorIds),
    p_project_ids: filterList(query?.projectIds),
  })

  if (error !== null) throw mapPostgrestError(error, { table: 'Comments', operation: 'read' })

  return parseRows('Comments', feedbackRowSchema, data ?? [], toMentorComment)
}

export async function insertComment(
  client: AppSupabaseClient,
  request: CreateMentorCommentRequest,
): Promise<MentorComment> {
  await assertCommentReferences(client, request)

  const { data, error } = await client
    .from('feedback')
    .insert(toFeedbackInsert(request))
    .select(FEEDBACK_COLUMNS)
    .single()

  if (error !== null) throw mapPostgrestError(error, { table: 'Comments', operation: 'insert' })

  return parseRows('Comments', feedbackRowSchema, [data], toMentorComment)[0]!
}

export async function updateCommentRow(
  client: AppSupabaseClient,
  id: string,
  request: UpdateMentorCommentRequest,
): Promise<MentorComment> {
  await assertCommentReferences(client, request)

  const payload = toFeedbackUpdate(request)

  if (Object.keys(payload).length === 0) return requireComment(client, id)

  const { data, error } = await client
    .from('feedback')
    .update(payload)
    .eq('id', id)
    .select(FEEDBACK_COLUMNS)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Comments', operation: 'update', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Comments', id)

  return parseRows('Comments', feedbackRowSchema, [data], toMentorComment)[0]!
}

/**
 * Puts a comment aside rather than destroying it.
 *
 * Feedback is somebody's considered writing about somebody else's work, and it is
 * the one thing here a developer cannot recreate for themselves. See
 * `soft-delete.ts`.
 */
export async function deleteCommentRow(client: AppSupabaseClient, id: string): Promise<void> {
  await softDeleteRow(client, 'feedback', id)
}

async function requireComment(
  client: AppSupabaseClient,
  id: string,
): Promise<MentorComment> {
  const { data, error } = await client
    .from('feedback')
    .select(FEEDBACK_COLUMNS)
    .eq('id', id)
    // Deleted comments are readable only by the bin, which has its own path.
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Comments', operation: 'read', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Comments', id)

  return parseRows('Comments', feedbackRowSchema, [data], toMentorComment)[0]!
}

/**
 * Checks the references a comment makes, for whichever of them are being set.
 *
 * A clearing `projectId` or `taskId` is skipped rather than looked up:
 * `undefined` means "no link", and there is nothing to confirm the existence
 * of. That the task belongs to the same developer is a separate question,
 * settled by the `feedback_guard_task` trigger — it compares two columns of
 * the row being written, which is not something a pre-flight check can see.
 */
async function assertCommentReferences(
  client: AppSupabaseClient,
  request: {
    developerId?: string | undefined
    mentorId?: string | undefined
    projectId?: string | undefined
    taskId?: string | undefined
  },
): Promise<void> {
  if (request.developerId !== undefined) await assertDeveloperExists(client, request.developerId)
  if (request.mentorId !== undefined) await assertMentorExists(client, request.mentorId)
  if (request.projectId !== undefined) await assertProjectExists(client, request.projectId)
  if (request.taskId !== undefined) await assertTaskExists(client, request.taskId)
}
