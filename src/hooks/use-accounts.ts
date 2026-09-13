import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import {
  areAccountsAvailable,
  listAccounts,
  setAccountState,
} from '@services/accounts/account.service'
import type { Account, SetAccountStateInput, SetAccountStateResult } from '@services/accounts/account.service'
import { isAdmin } from '@services/auth/permissions'
import { logFailure, toUserMessage } from '@services/errors/error-message'

import { queryKeys } from './query-keys'

/**
 * The logins, for the one screen that administers them.
 *
 * Not scoped by access scope, unlike the work hooks, because there is nothing for
 * a mentor mapping to narrow — `profiles_select` returns every row to an
 * administrator and one row to everybody else, and the screen behind this is
 * administrators only.
 */

export function useAccounts(): UseQueryResult<Account[]> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: listAccounts,

    // Asked only where the answer is the whole list. A developer would get their
    // own row back, which is not a screen, and a request that exists only to be
    // filtered out by row-level security is a request not worth making.
    enabled: !isRestoring && areAccountsAvailable() && isAdmin(user),
  })
}

/**
 * Enabling or disabling a login.
 *
 * Built like `useResetUserPassword` rather than on `useWorkTrackerMutation`: the
 * only cache this touches is its own list, so borrowing the record-write wrapper
 * would refetch the roster to express a change the roster does not hold.
 *
 * The list is invalidated whether it succeeded or failed. On success because the
 * state changed; on failure because a rejection here is often the server knowing
 * something this cache does not — an account somebody else already disabled — and
 * leaving a stale row on screen next to an error about it is how a screen starts
 * lying.
 */
export function useSetAccountState(): UseMutationResult<
  SetAccountStateResult,
  Error,
  SetAccountStateInput
> {
  const queryClient = useQueryClient()
  const snackbar = useSnackbar()

  return useMutation({
    mutationFn: setAccountState,

    onError: (error) => {
      logFailure('set account state', error)
      snackbar.error(toUserMessage(error, 'The account could not be changed. Please try again.'))
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts() })
    },
  })
}
