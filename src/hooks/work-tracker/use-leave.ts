import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type { CreateLeaveDayRequest, LeaveDay } from '@models/index'
import { getWorkTrackerService } from '@services/work-tracker.service'
import type { DateRange } from '@utils/date.utils'

import { queryKeys } from '../query-keys'
import { useScopedQuery, useWorkTrackerMutation } from './scoped-query'

export function useLeaveDays(
  range: DateRange,
  developerIds?: readonly string[],
): UseQueryResult<LeaveDay[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.leaveDays(scopeId, range, developerIds),
    (scope) =>
      service.getLeaveDays(scope, {
        dateFrom: range.from,
        dateTo: range.to,
        ...(developerIds === undefined ? {} : { developerIds }),
      }),
  )
}

export function useMarkLeaveDay(): UseMutationResult<LeaveDay, Error, CreateLeaveDayRequest> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (request: CreateLeaveDayRequest) => service.createLeaveDay(request),
    'work',
    'That day could not be marked as leave. Please try again.',
  )
}

export function useClearLeaveDay(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.clearLeaveDay(id),
    'work',
    'That leave day could not be removed. Please try again.',
  )
}
