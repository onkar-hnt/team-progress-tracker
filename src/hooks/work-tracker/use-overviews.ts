import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { getWorkTrackerService } from '@services/work-tracker.service'
import type { DayOverview, RangeOverview } from '@services/work-tracker.views'
import type { DateRange } from '@utils/date/date.utils'
import type { UpdateCoverage } from '@utils/update-coverage/update-coverage.utils'

import { queryKeys } from '../query-keys'
import { useAccessScope } from '../use-access-scope'
import { scopeIdOf, useScopedQuery } from './scoped-query'

export function useDayOverview(isoDate: string): UseQueryResult<DayOverview> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.dayOverview(scopeId, isoDate),
    (scope) => service.getDayOverview(scope, isoDate),
  )
}

export function useRangeOverview(range: DateRange): UseQueryResult<RangeOverview> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.rangeOverview(scopeId, range),
    (scope) => service.getRangeOverview(scope, range),
  )
}

/** `developerIds` narrows the read; left out, it covers everyone in scope. */
export function useUpdateCoverage(
  range: DateRange,
  developerIds?: readonly string[],
  options: { enabled?: boolean } = {},
): UseQueryResult<UpdateCoverage> {
  const service = getWorkTrackerService()
  const { isResolving, scope } = useAccessScope()

  return useQuery({
    queryKey: queryKeys.updateCoverage(scopeIdOf(scope), range, developerIds),
    queryFn: () => {
      if (scope === null) throw new Error('No access scope is available.')
      return service.getUpdateCoverage(scope, range, developerIds)
    },
    enabled: !isResolving && scope !== null && options.enabled !== false,
    placeholderData: keepPreviousData,
  })
}
