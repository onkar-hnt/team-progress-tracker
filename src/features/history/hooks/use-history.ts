import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { isHistoryAvailable, listChanges } from '@features/history/services/history.service'
import type { ChangeRecord } from '@features/history/services/history.service'

import { queryKeys } from '@hooks/query-keys'

export function useChangeLog(limit: number): UseQueryResult<ChangeRecord[]> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.changeLog(limit),
    queryFn: () => listChanges(limit),
    enabled: !isRestoring && user !== null && isHistoryAvailable(),
    staleTime: 60_000,
  })
}
