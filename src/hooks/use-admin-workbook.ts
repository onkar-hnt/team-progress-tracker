import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import {
  getAdminWorkbookInitialisation,
  retryAdminWorkbookInitialisation,
  subscribeToAdminWorkbookInitialisation,
} from '@services/admin/admin-workbook-initialisation'
import type { AdminWorkbookInitialisation } from '@services/admin/admin-workbook-initialisation'
import { getAdminWorkbookService } from '@services/admin/admin-workbook.service'
import type { AdminWorkbookStatus } from '@services/admin/admin-workbook.service'

import { queryKeys } from './query-keys'

/**
 * Admin-side view of the workbook the application is reading and writing.
 *
 * Kept apart from the record hooks in `use-work-tracker` because this is
 * about the data source rather than the data, and because it must keep
 * working when the workbook cannot be read — which is exactly when an
 * administrator needs to see it.
 */

export function useAdminWorkbookStatus(): UseQueryResult<AdminWorkbookStatus> {
  const service = getAdminWorkbookService()

  return useQuery({
    queryKey: queryKeys.adminWorkbook(),
    queryFn: () => service.getStatus(),

    // Reading structure costs a handful of Graph requests, so it is not
    // repeated on every remount; the mutation below refreshes it on demand.
    staleTime: 5 * 60_000,
  })
}

/**
 * Progress of the startup preparation of the Admin workbook.
 *
 * Read from the initialisation store rather than a query, because the work is
 * started by the session bootstrap and not by whichever component happens to
 * want to display it. Subscribing here cannot trigger a run.
 */
export function useAdminWorkbookInitialisation(): AdminWorkbookInitialisation {
  return useSyncExternalStore(
    subscribeToAdminWorkbookInitialisation,
    getAdminWorkbookInitialisation,
  )
}

/**
 * Re-checks the Admin workbook, creating anything missing.
 *
 * Goes through the same initialisation path as startup, so the manual action
 * and the automatic one share a single implementation, a single in-flight run
 * and a single reported state.
 *
 * Invalidates everything under the work-tracker root on success: repairing a
 * table means screens that failed to read it can now succeed, so they should
 * try again rather than keep showing the error they cached.
 */
export function useEnsureAdminWorkbook(): UseMutationResult<
  AdminWorkbookInitialisation,
  Error,
  void
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => retryAdminWorkbookInitialisation(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.root })
    },
  })
}
