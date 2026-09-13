import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { isHistoryAvailable, listChanges, listRecordChanges } from '@services/history/history.service'
import type { ChangeRecord, HistoryKind } from '@services/history/history.service'

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

export function useRecordHistory(
  kind: HistoryKind,
  recordId: string | null,
): UseQueryResult<ChangeRecord[]> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.recordChanges(kind, recordId ?? 'none'),
    queryFn: () => listRecordChanges(kind, recordId ?? ''),
    enabled: !isRestoring && user !== null && recordId !== null && isHistoryAvailable(),
  })
}
