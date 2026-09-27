import { useMemo } from 'react'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type {
  CreateMentorCommentRequest,
  MentorComment,
  MentorCommentQuery,
  UpdateMentorCommentRequest,
} from '@models/index'
import { getWorkTrackerService } from '@services/work-tracker.service'
import type { MentorCommentView } from '@services/work-tracker.views'

import { queryKeys } from '../query-keys'
import { useScopedQuery, useWorkTrackerMutation } from './scoped-query'
import type { UpdateVariables } from './scoped-query'

export function useComments(query?: MentorCommentQuery): UseQueryResult<MentorCommentView[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.comments(scopeId, query),
    (scope) => service.getCommentViews(scope, query),
    { keepsPreviousData: true },
  )
}

/** The trail for one task, oldest first, which is the order a conversation reads in. */
export function useTaskComments(taskId: string): UseQueryResult<MentorCommentView[]> {
  const service = getWorkTrackerService()
  const query = useMemo(() => ({ taskIds: [taskId] }), [taskId])

  return useScopedQuery(
    (scopeId) => queryKeys.comments(scopeId, query),
    async (scope) => {
      const comments = await service.getCommentViews(scope, query)
      return [...comments].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    },
    { keepsPreviousData: true },
  )
}

export function useCreateComment(): UseMutationResult<
  MentorComment,
  Error,
  CreateMentorCommentRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (request: CreateMentorCommentRequest) => service.createComment(request),
    'comments',
    'The feedback could not be saved. Please try again.',
  )
}

export function useUpdateComment(): UseMutationResult<
  MentorComment,
  Error,
  UpdateVariables<UpdateMentorCommentRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ changes, id }: UpdateVariables<UpdateMentorCommentRequest>) =>
      service.updateComment(id, changes),
    'comments',
    'The feedback could not be saved. Please try again.',
  )
}

export function useDeleteComment(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.deleteComment(id),
    'comments',
    'The feedback could not be deleted. Please try again.',
  )
}
