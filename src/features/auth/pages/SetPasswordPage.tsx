import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'

import { Button } from '@components/ui/button/Button'
import { PasswordField } from '@components/ui/field/Field'
import { FullPageLoader } from '@components/ui/feedback/Feedback'
import { APP_NAME } from '@constants/app.constants'
import { useAuth } from '@app/providers/auth-context'
import { PASSWORD_MIN_LENGTH, buildPasswordSchema } from '@services/auth/password-policy'
import type { PasswordFormValues } from '@services/auth/password-policy'
import { clearInviteLink, readInviteLink } from '@services/auth/invite-link'
import type { InviteLink } from '@services/auth/invite-link'
import { getSupabaseClient } from '@services/supabase/index'

import './LoginPage.scss'

type Stage =
  /** Holding a link whose tokens have not yet been exchanged for a session. */
  | { name: 'opening'; link: InviteLink }
  /** No link. Someone already signed in may still be here to change it. */
  | { name: 'checking'; rejection: string | null }
  /** The session is live and a password can be chosen. */
  | { name: 'ready'; kind: 'invite' | 'recovery' | 'change' }
  /** No usable link and no session — arrived directly, or the link expired. */
  | { name: 'unusable'; reason: string | null }

/**
 * Where an invitation email lands.
 *
 * The tokens were lifted out of the fragment by `captureInviteLink` before
 * the router started, so by the time this renders the address bar is already
 * a clean `#/set-password` and the credentials exist only in memory.
 *
 * Public, like the login screen: the person following the link has no
 * password yet, which is the entire reason they are here.
 */
export function SetPasswordPage() {
  const navigate = useNavigate()
  const { refreshUser, user } = useAuth()
  const [saveError, setSaveError] = useState<string | null>(null)

  // Decided during the first render rather than in an effect. Reading the
  // link is a pure lookup of something captured before React started, so
  // there is nothing to synchronise and no reason to render an empty frame
  // first. Only the token exchange, which is a network call, is an effect.
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

  // Someone already signed in needs no link. `updateUser` works against any
  // live session, so this doubles as the change-password screen — which is
  // the only way anybody can replace an initial password they were handed.
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

  // Sent here by the route guard rather than by choice, because the account
  // still holds the password it was issued.
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
              // Before navigating, not after: the guard reads the flag from
              // the user in context, so leaving without re-reading it would
              // bounce straight back here.
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

/**
 * Clears the password-change requirement.
 *
 * A database function rather than an update, because the column refuses to be
 * lowered by the account holder: the function re-derives the temporary
 * password and will not clear the flag while that password still opens the
 * account. So this cannot be called instead of changing the password, only
 * after.
 */
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
  /**
   * Set when the password changed but the flag did not clear.
   *
   * The two are separate calls — Supabase Auth owns one and the database owns
   * the other — so there is a window between them. Leaving quietly would
   * strand the account holding a password they chose while the application
   * still believes they hold a temporary one, so the form stops and offers to
   * finish instead.
   *
   * Not a dead end if they close the tab: the flag is still set, so the guard
   * returns them here, and by then their password is the new one — which is
   * exactly what the database checks before clearing.
   */
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

    // Only once Supabase has confirmed the new password, never alongside it.
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
