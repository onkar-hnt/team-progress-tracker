import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'

import { useSnackbar } from '@app/providers/snackbar-context'
import { logFailure, toUserMessage } from '@services/errors/error-message'
import { resetUserPassword } from '@services/provisioning/reset-password'
import type { ResetPasswordInput, ResetPasswordResult } from '@services/provisioning/reset-password'

export function useResetUserPassword(): UseMutationResult<
  ResetPasswordResult,
  Error,
  ResetPasswordInput
> {
  const snackbar = useSnackbar()

  return useMutation({
    mutationFn: resetUserPassword,
    onError: (error) => {
      logFailure('reset password', error)
      snackbar.error(
        toUserMessage(error, 'The password could not be changed. Please try again.'),
      )
    },
  })
}
