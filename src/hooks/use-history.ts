import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { isHistoryAvailable, listChanges, listRecordChanges } from '@services/history/history.service'
import type { ChangeRecord, HistoryKind } from '@services/history/history.service'

import { queryKeys } from './query-keys'

/**
 * Reading the change log.
 *
 * Unscoped, like the recycle-bin hooks: `record_history_select` decides whose
 * changes come back, so there is nothing here for an access scope to narrow and no
 * id for a caller to pass.
 *
 * Read-only, and there is no mutation hook in this file because there is nothing to
 * write. The log is not invalidated after a write either — every mutation already
 * invalidates the root key, which covers it.
 */

export function useChangeLog(limit: number): UseQueryResult<ChangeRecord[]> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.changeLog(limit),
    queryFn: () => listChanges(limit),
    enabled: !isRestoring && user !== null && isHistoryAvailable(),

    // The log is only ever appended to, so a page held for a minute is a page that
    // is missing the last minute rather than one that is wrong. Long enough that
    // paging through it does not re-ask for what it already has.
    staleTime: 60_000,
  })
}

/**
 * Everything that has happened to one record.
 *
 * `enabled` on the id rather than the caller checking: the panel that shows this is
 * rendered beside a record and would otherwise have to guard every call itself.
 */
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
