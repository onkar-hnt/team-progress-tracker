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

  const request = client.rpc('list_feedback', {
    p_date_from: query?.dateFrom ?? null,
    p_date_to: query?.dateTo ?? null,
    p_developer_ids: filterList(query?.developerIds),
    p_mentor_ids: filterList(query?.mentorIds),
    p_project_ids: filterList(query?.projectIds),
  })

  const { data, error } =
    query?.limit === undefined
      ? await request
      : await request
          .order('feedback_date', { ascending: false })
          .order('id', { ascending: false })
          .limit(query.limit)

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
