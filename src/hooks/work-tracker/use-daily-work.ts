import { useQuery } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type {
  CreateDailyWorkEntryRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  UpdateDailyWorkEntryRequest,
} from '@models/index'
import { getWorkTrackerService } from '@services/work-tracker.service'
import type { DailyWorkEntryView } from '@services/work-tracker.views'

import { parseDailyWorkQuery, queryKeys } from '../query-keys'
import { useAccessScope } from '../use-access-scope'
import { scopeIdOf, useWorkTrackerMutation } from './scoped-query'
import type { UpdateVariables } from './scoped-query'

export function useDailyWorkEntries(
  query?: DailyWorkQuery,
  options: { enabled?: boolean; staleTime?: number } = {},
): UseQueryResult<DailyWorkEntryView[]> {
  const service = getWorkTrackerService()
  const { isResolving, scope } = useAccessScope()

  return useQuery({
    queryKey: queryKeys.dailyWork(scopeIdOf(scope), query),
    queryFn: ({ queryKey }) => {
      if (scope === null) throw new Error('No access scope is available.')

      // The serialized filter on the key is what this cache entry means.
      // Reading it here, rather than from the hook closure, keeps a slow
      // response from being stored as another selection's rows.
      return service.getDailyWorkEntryViews(scope, dailyQueryFromKey(queryKey))
    },
    enabled: !isResolving && scope !== null && options.enabled !== false,
    ...(options.staleTime === undefined ? {} : { staleTime: options.staleTime }),
  })
}

function dailyQueryFromKey(queryKey: readonly unknown[]): DailyWorkQuery | undefined {
  const serialized = queryKey.find((part) => typeof part === 'string' && part.startsWith('['))

  return typeof serialized === 'string' ? parseDailyWorkQuery(serialized) : undefined
}

export function useCreateDailyWorkEntry(): UseMutationResult<
  DailyWorkEntry,
  Error,
  CreateDailyWorkEntryRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (request: CreateDailyWorkEntryRequest) => service.createDailyWorkEntry(request),
    'work',
    'The daily update could not be submitted. Please try again.',
  )
}

export type UpdateDailyWorkEntryVariables = UpdateVariables<UpdateDailyWorkEntryRequest>

export function useUpdateDailyWorkEntry(): UseMutationResult<
  DailyWorkEntry,
  Error,
  UpdateDailyWorkEntryVariables
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ changes, id }: UpdateDailyWorkEntryVariables) => service.updateDailyWorkEntry(id, changes),
    'work',
    'The daily update could not be saved. Please try again.',
  )
}

export function useDeleteDailyWorkEntry(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.deleteDailyWorkEntry(id),
    'work',
    'The daily update could not be deleted. Please try again.',
  )
}
