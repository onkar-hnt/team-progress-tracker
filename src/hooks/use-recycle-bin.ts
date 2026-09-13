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
import { getWorkTrackerService } from '@services/work-tracker.service'

import { queryKeys } from './query-keys'

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

function useRefreshEverything(): () => Promise<void> {
  const queryClient = useQueryClient()

  return async () => {
    getWorkTrackerService().forgetLookups()
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
