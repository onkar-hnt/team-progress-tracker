import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { isHistoryAvailable, listChanges } from '@services/history/history.service'
import type { ChangeRecord } from '@services/history/history.service'

import { queryKeys } from './query-keys'

export function useChangeLog(limit: number): UseQueryResult<ChangeRecord[]> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.changeLog(limit),
    queryFn: () => listChanges(limit),
    enabled: !isRestoring && user !== null && isHistoryAvailable(),
    staleTime: 60_000,
  })
}
