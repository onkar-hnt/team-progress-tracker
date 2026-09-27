/**
 * The query and mutation plumbing every work-tracker hook is built on.
 *
 * Two things are shared. A read is keyed by the access scope that produced it,
 * so one person's rows are never served to another from cache. A write says
 * which family of reads it disturbs, and that family is invalidated on success.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import { useSnackbar } from '@app/providers/snackbar-context'
import { describeScope } from '@services/auth/index'
import type { AccessScope } from '@services/auth/index'
import { logFailure, toUserMessage } from '@services/errors/error-message'
import { getWorkTrackerService } from '@services/work-tracker.service'

import { queryKeys } from '../query-keys'
import { useAccessScope } from '../use-access-scope'

/** Identifies the cache entry a scope's answer belongs to. */
export function scopeIdOf(scope: AccessScope | null): string {
  return scope === null ? 'none' : describeScope(scope)
}

export function useScopedQuery<TValue>(
  buildKey: (scopeId: string) => readonly unknown[],
  run: (scope: AccessScope) => Promise<TValue>,
  options: { staleTime?: number; keepsPreviousData?: boolean } = {},
): UseQueryResult<TValue> {
  const { isResolving, scope } = useAccessScope()

  return useQuery({
    queryKey: buildKey(scopeIdOf(scope)),
    queryFn: () => {
      if (scope === null) throw new Error('No access scope is available.')
      return run(scope)
    },
    enabled: !isResolving && scope !== null,
    ...(options.staleTime === undefined ? {} : { staleTime: options.staleTime }),

    ...(options.keepsPreviousData === true ? { placeholderData: keepPreviousData } : {}),
  })
}

/** How long the roster is trusted, which is as long as the service memoises it. */
export const ROSTER_STALE_TIME = 5 * 60_000

export type WriteScope = 'comments' | 'roster' | 'work'

const AFFECTED_BY: Readonly<Record<WriteScope, readonly (readonly unknown[])[]>> = {
  work: [
    queryKeys.allDailyWork(),
    queryKeys.allTasks(),
    queryKeys.allDayOverviews(),
    queryKeys.allRangeOverviews(),
    queryKeys.allComments(),
    queryKeys.allLeaveDays(),
    queryKeys.allUpdateCoverage(),
  ],

  comments: [queryKeys.allComments()],

  roster: [queryKeys.root],
}

function useInvalidateWorkTracker(scope: WriteScope): () => Promise<void> {
  const queryClient = useQueryClient()
  const service = getWorkTrackerService()

  return async () => {
    if (scope === 'roster') service.forgetLookups()

    await Promise.all(
      AFFECTED_BY[scope].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  }
}

export function useRefreshWorkTracker(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient()
  const service = getWorkTrackerService()

  return useMutation({
    mutationFn: async () => {
      service.forgetLookups()
      await queryClient.invalidateQueries({ queryKey: queryKeys.root })
    },
  })
}

/** A null `failureMessage` means the caller reports the failure itself. */
export function useWorkTrackerMutation<TResult, TVariables>(
  run: (variables: TVariables) => Promise<TResult>,
  scope: WriteScope,
  failureMessage: string | null,
): UseMutationResult<TResult, Error, TVariables> {
  const invalidate = useInvalidateWorkTracker(scope)
  const snackbar = useSnackbar()

  return useMutation({
    mutationFn: run,
    onSuccess: invalidate,
    onError: (error) => {
      logFailure(`write:${scope}`, error)

      if (failureMessage !== null) snackbar.error(toUserMessage(error, failureMessage))
    },
  })
}

export interface UpdateVariables<TRequest> {
  id: string
  changes: TRequest
}
