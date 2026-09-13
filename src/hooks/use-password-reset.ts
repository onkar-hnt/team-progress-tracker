import { useMutation } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'

import { useSnackbar } from '@app/providers/snackbar-context'
import { logFailure, toUserMessage } from '@services/errors/error-message'
import { resetUserPassword } from '@services/provisioning/reset-password'
import type { ResetPasswordInput, ResetPasswordResult } from '@services/provisioning/reset-password'

/**
 * Setting somebody else's password, as a mutation.
 *
 * A mutation rather than a bare call so the control can report that it is working
 * and refuse a second press, which matters more here than for most writes: two
 * resets in flight would set two passwords, and the one that lands second is the
 * one the person actually has — while the administrator has already been told the
 * first.
 *
 * Deliberately not built on `useWorkTrackerMutation`, which every record write
 * uses. That wrapper's job is to invalidate the queries a write touched, and this
 * touches none: a password is not in any cache, and `must_change_password` is not
 * on any screen. Borrowing it would have meant refetching the whole roster to
 * express "nothing you can see has changed".
 *
 * What it does borrow is that wrapper's error handling, exactly: log the detail
 * for the console, translate the message for the reader. That is not a nicety —
 * `ConfirmRequest.action` closes the dialog and reports nothing when the work it
 * was given rejects, on the understanding that mutations announce their own
 * failures. A reset that reported nothing would be a dialog that vanished, a
 * password that had not changed, and no way to tell.
 *
 * Success is left to the caller, which knows the name of the person and whether
 * the server sent a warning alongside.
 */
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
