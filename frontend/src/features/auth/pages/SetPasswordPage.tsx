import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@components/ui/button/Button'
import { PasswordField } from '@components/ui/field/Field'
import { FullPageLoader } from '@components/ui/full-page-loader/FullPageLoader'
import { APP_NAME } from '@constants/app.constants'
import { useAuth } from '@app/providers/auth-context'
import { changeOwnPassword } from '@services/auth/index'
import { PASSWORD_MIN_LENGTH, buildPasswordSchema } from '@services/auth/password-policy'
import type { PasswordFormValues } from '@services/auth/password-policy'
import { toUserMessage } from '@services/errors/error-message'

import './LoginPage.scss'

type VoluntaryPasswordFormValues = PasswordFormValues & {
  currentPassword: string
}

function buildVoluntaryPasswordSchema(name: string | null) {
  return buildPasswordSchema(name).and(
    z.object({
      currentPassword: z.string().min(1, { message: 'Enter your current password' }),
    }),
  )
}

export function SetPasswordPage() {
  const navigate = useNavigate()
  const { isRestoring, refreshUser, user } = useAuth()
  const [saveError, setSaveError] = useState<string | null>(null)

  if (isRestoring) return <FullPageLoader label="Checking your session…" />

  if (user === null) {
    return (
      <main className="login">
        <section className="login__card">
          <header className="login__header">
            <span className="login__eyebrow">{APP_NAME}</span>
            <h1 className="login__title">Choose a new password</h1>
            <p className="login__subtitle">This link cannot be used.</p>
          </header>

          <div className="login__form">
            <p className="login__hint">Sign in first, then open this screen from your profile.</p>
            <Button onClick={() => void navigate('/login', { replace: true })} variant="primary">
              Go to sign in
            </Button>
          </div>
        </section>
      </main>
    )
  }

  const isForced = user.mustChangePassword === true

  const onSaved = async () => {
    await refreshUser()
    void navigate('/dashboard', { replace: true })
  }

  return (
    <main className="login">
      <section className="login__card">
        <header className="login__header">
          <span className="login__eyebrow">{APP_NAME}</span>
          <h1 className="login__title">
            {isForced ? 'Choose your password' : 'Choose a new password'}
          </h1>
          <p className="login__subtitle">
            {isForced
              ? 'Your account was set up with a temporary password. Replace it to carry on.'
              : 'Replace your current password with one only you know.'}
          </p>
        </header>

        {isForced ? (
          <ForcedPasswordForm name={user.name} onError={setSaveError} onSaved={onSaved} />
        ) : (
          <VoluntaryPasswordForm name={user.name} onError={setSaveError} onSaved={onSaved} />
        )}

        <div aria-live="assertive" role="status">
          {saveError === null ? null : <p className="form__alert">{saveError}</p>}
        </div>
      </section>
    </main>
  )
}

function ForcedPasswordForm({
  name,
  onError,
  onSaved,
}: {
  name: string
  onError: (message: string | null) => void
  onSaved: () => Promise<void>
}) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(buildPasswordSchema(name)),
    defaultValues: { password: '', confirmation: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    onError(null)

    try {
      await changeOwnPassword({ newPassword: values.password })
    } catch (error) {
      onError(toUserMessage(error, 'Your password could not be set. Please try again.'))
      return
    }

    await onSaved()
  })

  return (
    <form className="login__form" noValidate onSubmit={onSubmit}>
      <PasswordField
        autoComplete="new-password"
        error={errors.password?.message}
        hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
        id="new-password"
        label="New password"
        {...register('password')}
      />

      <PasswordField
        autoComplete="new-password"
        error={errors.confirmation?.message}
        id="confirm-password"
        label="Confirm password"
        {...register('confirmation')}
      />

      <Button disabled={isSubmitting} type="submit" variant="primary">
        {isSubmitting ? 'Saving…' : 'Set password and continue'}
      </Button>
    </form>
  )
}

function VoluntaryPasswordForm({
  name,
  onError,
  onSaved,
}: {
  name: string
  onError: (message: string | null) => void
  onSaved: () => Promise<void>
}) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<VoluntaryPasswordFormValues>({
    resolver: zodResolver(buildVoluntaryPasswordSchema(name)),
    defaultValues: { password: '', confirmation: '', currentPassword: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    onError(null)

    try {
      await changeOwnPassword({
        currentPassword: values.currentPassword,
        newPassword: values.password,
      })
    } catch (error) {
      onError(toUserMessage(error, 'Your password could not be set. Please try again.'))
      return
    }

    await onSaved()
  })

  return (
    <form className="login__form" noValidate onSubmit={onSubmit}>
      <PasswordField
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        id="current-password"
        label="Current password"
        {...register('currentPassword')}
      />

      <PasswordField
        autoComplete="new-password"
        error={errors.password?.message}
        hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
        id="new-password"
        label="New password"
        {...register('password')}
      />

      <PasswordField
        autoComplete="new-password"
        error={errors.confirmation?.message}
        id="confirm-password"
        label="Confirm password"
        {...register('confirmation')}
      />

      <Button disabled={isSubmitting} type="submit" variant="primary">
        {isSubmitting ? 'Saving…' : 'Set password and continue'}
      </Button>
    </form>
  )
}
