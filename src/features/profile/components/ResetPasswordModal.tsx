import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { PasswordField } from '@components/ui/field/Field'
import { Modal } from '@components/ui/modal/Modal'
import { useResetUserPassword } from '@features/profile/hooks/use-password-reset'
import { PASSWORD_MIN_LENGTH, buildPasswordSchema } from '@services/auth/password-policy'
import type { PasswordFormValues } from '@services/auth/password-policy'
import type { ResetPasswordResult } from '@features/profile/services/reset-password'

import type { Candidate } from '../utils/password-candidates'

// The note below is styled by the panel's sheet; imported here too so this
// dialog does not depend on the panel having been rendered first.
import './PasswordManagement.scss'

interface ResetPasswordModalProps {
  /** `null` when nobody is chosen, which is what closes the dialog. */
  candidate: Candidate | null

  onClose: () => void
}

/** `Modal` mounts its body only while open, so the fields re-seed on each open. */
export function ResetPasswordModal({ candidate, onClose }: ResetPasswordModalProps) {
  return (
    <Modal
      isOpen={candidate !== null}
      onClose={onClose}
      title={candidate === null ? '' : `Set a password for ${candidate.name}`}
    >
      {candidate === null ? null : (
        <ResetPasswordForm candidate={candidate} onDone={onClose} />
      )}
    </Modal>
  )
}

function ResetPasswordForm({
  candidate,
  onDone,
}: {
  candidate: Candidate
  onDone: () => void
}) {
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const reset = useResetUserPassword()

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(buildPasswordSchema(candidate.name)),
    defaultValues: { password: '', confirmation: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    let outcome: ResetPasswordResult | null = null

    const isDone = await confirm({
      title: 'Set this password?',
      message: `${candidate.name} will be able to sign in with the password you have typed, and will be asked to replace it. Whatever password they had stops working, and it cannot be recovered.`,
      confirmLabel: 'Set password',
      isDestructive: true,
      action: async () => {
        outcome = await reset.mutateAsync({
          target: candidate.kind,
          rowId: candidate.id,
          password: values.password,
        })
      },
    })

    if (!isDone || outcome === null) return

    onDone()

    const result: ResetPasswordResult = outcome

    if (result.warning === undefined) {
      snackbar.success(
        `The password for ${result.name} was set. They will be asked to replace it the next time they sign in.`,
      )
    } else {
      snackbar.warning(result.warning, { duration: 0 })
    }
  })

  return (
    <form className="form" noValidate onSubmit={onSubmit}>
      <p className="password-management__note">
        You are choosing this password on behalf of {candidate.name}, so tell them what it is.
        Nothing here can read it back afterwards — if it is lost, the only way forward is to set
        another one.
      </p>

      <PasswordField
        autoComplete="new-password"
        error={errors.password?.message}
        hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
        id="reset-password"
        label="New password"
        {...register('password')}
      />

      <PasswordField
        autoComplete="new-password"
        error={errors.confirmation?.message}
        id="reset-password-confirm"
        label="Confirm password"
        {...register('confirmation')}
      />

      <div className="form__actions">
        <Button disabled={isSubmitting} onClick={onDone} variant="secondary">
          Cancel
        </Button>

        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Working…' : 'Set password'}
        </Button>
      </div>
    </form>
  )
}
