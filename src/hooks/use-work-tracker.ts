import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type {
  CreateDailyWorkEntryRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  Developer,
  Project,
  UpdateDailyWorkEntryRequest,
} from '@models/index'
import { getWorkTrackerService } from '@services/work-tracker.service'
import type {
  DailyWorkEntryView,
  DayOverview,
  RangeOverview,
} from '@services/work-tracker.service'
import type { DateRange } from '@utils/date.utils'

import { queryKeys } from './query-keys'

/**
 * Data hooks for feature components.
 *
 * Components use these and never reach for the service or a provider
 * directly, which is what keeps the storage backend replaceable. Caching,
 * loading and error state are TanStack Query's concern; the shape of the data
 * is the service's.
 */

export function useDevelopers(): UseQueryResult<Developer[]> {
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: queryKeys.developers(),
    queryFn: () => service.getDevelopers(),
    // The team list changes rarely, so it can be cached far longer than work entries.
    staleTime: 5 * 60_000,
  })
}

export function useActiveDevelopers(): UseQueryResult<Developer[]> {
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: [...queryKeys.developers(), 'active'],
    queryFn: () => service.getActiveDevelopers(),
    staleTime: 5 * 60_000,
  })
}

export function useProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => service.getProjects(),
    staleTime: 5 * 60_000,
  })
}

export function useActiveProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: [...queryKeys.projects(), 'active'],
    queryFn: () => service.getActiveProjects(),
    staleTime: 5 * 60_000,
  })
}

/** Entries with developer and project names resolved, newest first. */
export function useDailyWorkEntries(query?: DailyWorkQuery): UseQueryResult<DailyWorkEntryView[]> {
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: queryKeys.dailyWork(query),
    queryFn: () => service.getDailyWorkEntryViews(query),
  })
}

export function useDailyWorkEntry(id: string | undefined): UseQueryResult<DailyWorkEntry | null> {
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: queryKeys.dailyWorkEntry(id ?? ''),
    queryFn: () => service.getDailyWorkEntryById(id ?? ''),
    enabled: id !== undefined && id !== '',
  })
}

export function useDayOverview(isoDate: string): UseQueryResult<DayOverview> {
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: queryKeys.dayOverview(isoDate),
    queryFn: () => service.getDayOverview(isoDate),
  })
}

export function useRangeOverview(range: DateRange): UseQueryResult<RangeOverview> {
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: queryKeys.rangeOverview(range),
    queryFn: () => service.getRangeOverview(range),
  })
}

/**
 * Invalidates every derived view after a write.
 *
 * A single entry feeds the dashboard, trends, developer views and reports, so
 * targeted invalidation would be easy to get subtly wrong. Refetching all
 * work-tracker queries is cheap for a team of this size and always correct.
 */
function useInvalidateWorkTracker(): () => Promise<void> {
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.root })
  }
}

export function useCreateDailyWorkEntry(): UseMutationResult<
  DailyWorkEntry,
  Error,
  CreateDailyWorkEntryRequest
> {
  const service = getWorkTrackerService()
  const invalidate = useInvalidateWorkTracker()

  return useMutation({
    mutationFn: (request: CreateDailyWorkEntryRequest) => service.createDailyWorkEntry(request),
    onSuccess: invalidate,
  })
}

export interface UpdateDailyWorkEntryVariables {
  id: string
  changes: UpdateDailyWorkEntryRequest
}

export function useUpdateDailyWorkEntry(): UseMutationResult<
  DailyWorkEntry,
  Error,
  UpdateDailyWorkEntryVariables
> {
  const service = getWorkTrackerService()
  const invalidate = useInvalidateWorkTracker()

  return useMutation({
    mutationFn: ({ id, changes }: UpdateDailyWorkEntryVariables) =>
      service.updateDailyWorkEntry(id, changes),
    onSuccess: invalidate,
  })
}

export function useDeleteDailyWorkEntry(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  const invalidate = useInvalidateWorkTracker()

  return useMutation({
    mutationFn: (id: string) => service.deleteDailyWorkEntry(id),
    onSuccess: invalidate,
  })
}
