import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'

import { Button } from '@components/ui/button/Button'
import { PasswordField } from '@components/ui/field/Field'
import { FullPageLoader } from '@components/ui/full-page-loader/FullPageLoader'
import { APP_NAME } from '@constants/app.constants'
import { useAuth } from '@app/providers/auth-context'
import { PASSWORD_MIN_LENGTH, buildPasswordSchema } from '@services/auth/password-policy'
import type { PasswordFormValues } from '@services/auth/password-policy'
import { clearInviteLink, readInviteLink } from '@services/auth/invite-link'
import type { InviteLink } from '@services/auth/invite-link'
import { getSupabaseClient } from '@services/supabase/index'

import './LoginPage.scss'

type Stage =
  | { name: 'opening'; link: InviteLink }
  | { name: 'checking'; rejection: string | null }
  | { name: 'ready'; kind: 'invite' | 'recovery' | 'change' }
  | { name: 'unusable'; reason: string | null }

export function SetPasswordPage() {
  const navigate = useNavigate()
  const { refreshUser, user } = useAuth()
  const [saveError, setSaveError] = useState<string | null>(null)

  const [stage, setStage] = useState<Stage>(() => {
    const { link, rejection } = readInviteLink()
    return link === null ? { name: 'checking', rejection } : { name: 'opening', link }
  })

  const pending = stage.name === 'opening' ? stage.link : null

  useEffect(() => {
    if (pending === null) return

    let cancelled = false

    const open = async () => {
      const { error } = await getSupabaseClient().auth.setSession({
        access_token: pending.accessToken,
        refresh_token: pending.refreshToken,
      })

      if (cancelled) return

      setStage(
        error === null
          ? { name: 'ready', kind: pending.kind }
          : { name: 'unusable', reason: error.message },
      )
    }

    void open()

    return () => {
      cancelled = true
    }
  }, [pending])

  const rejection = stage.name === 'checking' ? stage.rejection : null
  const isChecking = stage.name === 'checking'

  useEffect(() => {
    if (!isChecking) return

    let cancelled = false

    const look = async () => {
      const {
        data: { session },
      } = await getSupabaseClient().auth.getSession()

      if (cancelled) return

      setStage(
        session === null
          ? { name: 'unusable', reason: rejection }
          : { name: 'ready', kind: 'change' },
      )
    }

    void look()

    return () => {
      cancelled = true
    }
  }, [isChecking, rejection])

  if (stage.name === 'opening') return <FullPageLoader label="Opening your invitation…" />
  if (stage.name === 'checking') return <FullPageLoader label="Checking your session…" />

  const isForced = user?.mustChangePassword === true

  return (
    <main className="login">
      <section className="login__card">
        <header className="login__header">
          <span className="login__eyebrow">{APP_NAME}</span>
          <h1 className="login__title">
            {stage.name === 'ready' && stage.kind === 'invite'
              ? 'Set your password'
              : isForced
                ? 'Choose your password'
                : 'Choose a new password'}
          </h1>
          <p className="login__subtitle">
            {stage.name !== 'ready'
              ? 'This link cannot be used.'
              : isForced
                ? 'Your account was set up with a temporary password. Replace it to carry on.'
                : stage.kind === 'change'
                  ? 'Replace your current password with one only you know.'
                  : 'Pick a password and you will be signed in straight away.'}
          </p>
        </header>

        {stage.name === 'unusable' ? (
          <div className="login__form">
            <p className="login__hint">
              Invitation links work once and expire. Ask your administrator to send a new one, or
              sign in if you have already set a password.
            </p>
            {stage.reason === null ? null : <p className="form__error">{stage.reason}</p>}
            <Button
              onClick={() => void navigate('/login', { replace: true })}
              variant="primary"
            >
              Go to sign in
            </Button>
          </div>
        ) : (
          <PasswordForm
            name={user?.name ?? null}
            onError={setSaveError}
            onSaved={async () => {
              clearInviteLink()
              await refreshUser()
              void navigate('/dashboard', { replace: true })
            }}
          />
        )}

        <div aria-live="assertive" role="status">
          {saveError === null ? null : <p className="form__alert">{saveError}</p>}
        </div>
      </section>
    </main>
  )
}

// DB function clears must_change_password only after the temp password is gone.
async function completePasswordChange(): Promise<string | null> {
  const { error } = await getSupabaseClient().rpc('complete_password_change')

  return error === null ? null : error.message
}

function PasswordForm({
  name,
  onError,
  onSaved,
}: {
  name: string | null
  onError: (message: string | null) => void
  onSaved: () => Promise<void>
}) {
  const [needsCompletion, setNeedsCompletion] = useState(false)

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(buildPasswordSchema(name)),
    defaultValues: { password: '', confirmation: '' },
  })

  const finish = async () => {
    const failure = await completePasswordChange()

    if (failure !== null) {
      onError(`Your password was changed, but the account is not finished being set up: ${failure}`)
      setNeedsCompletion(true)
      return
    }

    setNeedsCompletion(false)
    await onSaved()
  }

  const onSubmit = handleSubmit(async (values) => {
    onError(null)

    const { error } = await getSupabaseClient().auth.updateUser({ password: values.password })

    if (error !== null) {
      onError(`Your password could not be set: ${error.message}`)
      return
    }

    await finish()
  })

  if (needsCompletion) {
    return (
      <div className="login__form">
        <p className="login__hint">
          Your new password is saved and is the one to sign in with. Finishing the setup did not
          go through, so this screen will keep appearing until it does.
        </p>
        <Button onClick={() => void finish()} variant="primary">
          Finish setting up
        </Button>
      </div>
    )
  }

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
