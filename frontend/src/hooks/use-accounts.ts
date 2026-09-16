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
import { logFailure, toFeatureMessage } from '@services/errors/error-message'

import { queryKeys } from './query-keys'

export function useAccounts(): UseQueryResult<Account[]> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.accounts(),
    queryFn: listAccounts,
    enabled: !isRestoring && areAccountsAvailable() && isAdmin(user),
  })
}

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
      const message = toFeatureMessage(error, 'The account could not be changed. Please try again.')

      if (message !== null) snackbar.error(message)
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts() })
    },
  })
}
