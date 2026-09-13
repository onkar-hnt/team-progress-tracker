import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { logFailure, toUserMessage } from '@services/errors/error-message'
import {
  destroyRecord,
  isRecycleBinAvailable,
  listDeletedRecords,
  restoreRecord,
} from '@services/recycle-bin/recycle-bin.service'
import type { DeletedRecord, DeletedRecordKind } from '@services/recycle-bin/recycle-bin.service'

import { queryKeys } from './query-keys'

/**
 * Reading and emptying the bin.
 *
 * Unscoped, unlike the work-tracker hooks. The three select policies decide what
 * comes back — a developer's own deleted entries, a mentor's developers', an
 * administrator's everything — so there is nothing here for an access scope to
 * narrow and no id for a caller to pass.
 */

export function useDeletedRecords(): UseQueryResult<DeletedRecord[]> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.deletedRecords(),
    queryFn: listDeletedRecords,
    enabled: !isRestoring && user !== null && isRecycleBinAvailable(),
  })
}

export interface BinAction {
  kind: DeletedRecordKind
  id: string
}

/**
 * Everything a restore could put back on a screen.
 *
 * Broad on purpose. Restoring one work entry changes the dashboard, the team
 * activity list, the developer's own history and every report covering that date —
 * and the bin has no way to know which of those are mounted. The root key covers
 * all of it in one call, which for a screen used this rarely is the right trade
 * against enumerating five families and forgetting the sixth.
 */
function useRefreshEverything(): () => Promise<void> {
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.root })
  }
}

export function useRestoreRecord(): UseMutationResult<void, Error, BinAction> {
  const refresh = useRefreshEverything()
  const snackbar = useSnackbar()

  return useMutation({
    mutationFn: ({ id, kind }: BinAction) => restoreRecord(kind, id),

    onError: (error) => {
      logFailure('restore deleted record', error)
      snackbar.error(toUserMessage(error, 'That record could not be restored. Please try again.'))
    },

    // Whether it worked or not: a failure is often somebody else having got there
    // first, and the bin should stop offering what is no longer in it.
    onSettled: refresh,
  })
}

export function useDestroyRecord(): UseMutationResult<void, Error, BinAction> {
  const refresh = useRefreshEverything()
  const snackbar = useSnackbar()

  return useMutation({
    mutationFn: ({ id, kind }: BinAction) => destroyRecord(kind, id),

    onError: (error) => {
      logFailure('destroy deleted record', error)
      snackbar.error(toUserMessage(error, 'That record could not be destroyed. Please try again.'))
    },

    onSettled: refresh,
  })
}
