import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { FullPageLoader } from '@components/ui/feedback/Feedback'
import { APP_NAME } from '@constants/app.constants'
import { clearInviteLink, readInviteLink } from '@services/auth/invite-link'
import type { InviteLink } from '@services/auth/invite-link'
import { getSupabaseClient } from '@services/supabase/index'

import './LoginPage.scss'

/**
 * Twelve rather than Supabase's default six.
 *
 * This is the one moment the application gets to insist, and the account it
 * protects can log work attributed to a named person.
 */
const PASSWORD_MIN = 12

const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN, { message: `Use at least ${PASSWORD_MIN} characters` }),
    confirmation: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmation) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmation'],
        message: 'Both entries must match',
      })
    }
  })

type SetPasswordValues = z.infer<typeof setPasswordSchema>

type Stage =
  /** Holding a link whose tokens have not yet been exchanged for a session. */
  | { name: 'opening'; link: InviteLink }
  /** The session is live and a password can be chosen. */
  | { name: 'ready'; kind: 'invite' | 'recovery' }
  /** No usable link — arrived directly, refreshed, or the link had expired. */
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
  const [saveError, setSaveError] = useState<string | null>(null)

  // Decided during the first render rather than in an effect. Reading the
  // link is a pure lookup of something captured before React started, so
  // there is nothing to synchronise and no reason to render an empty frame
  // first. Only the token exchange, which is a network call, is an effect.
  const [stage, setStage] = useState<Stage>(() => {
    const { link, rejection } = readInviteLink()
    return link === null ? { name: 'unusable', reason: rejection } : { name: 'opening', link }
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

  if (stage.name === 'opening') return <FullPageLoader label="Opening your invitation…" />

  return (
    <main className="login">
      <section className="login__card">
        <header className="login__header">
          <span className="login__eyebrow">{APP_NAME}</span>
          <h1 className="login__title">
            {stage.name === 'ready' && stage.kind === 'recovery'
              ? 'Choose a new password'
              : 'Set your password'}
          </h1>
          <p className="login__subtitle">
            {stage.name === 'ready'
              ? 'Pick a password and you will be signed in straight away.'
              : 'This link cannot be used.'}
          </p>
        </header>

        {stage.name === 'unusable' ? (
          <div className="login__form">
            <p className="login__hint">
              Invitation links work once and expire. Ask your administrator to send a new one, or
              sign in if you have already set a password.
            </p>
            {stage.reason === null ? null : (
              <p className="login__error">{stage.reason}</p>
            )}
            <button
              className="login__submit"
              onClick={() => void navigate('/login', { replace: true })}
              type="button"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <PasswordForm
            onError={setSaveError}
            onSaved={() => {
              clearInviteLink()
              void navigate('/dashboard', { replace: true })
            }}
          />
        )}

        <div aria-live="assertive" role="status">
          {saveError === null ? null : <p className="login__alert">{saveError}</p>}
        </div>
      </section>
    </main>
  )
}

function PasswordForm({
  onError,
  onSaved,
}: {
  onError: (message: string | null) => void
  onSaved: () => void
}) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirmation: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    onError(null)

    const { error } = await getSupabaseClient().auth.updateUser({ password: values.password })

    if (error !== null) {
      onError(`Your password could not be set: ${error.message}`)
      return
    }

    onSaved()
  })

  return (
    <form className="login__form" noValidate onSubmit={onSubmit}>
      <div className="login__field">
        <label htmlFor="new-password">New password</label>
        <input
          autoComplete="new-password"
          id="new-password"
          type="password"
          {...register('password')}
          aria-describedby={errors.password ? 'new-password-error' : undefined}
          aria-invalid={errors.password ? 'true' : undefined}
        />
        {errors.password ? (
          <p className="login__error" id="new-password-error">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="login__field">
        <label htmlFor="confirm-password">Confirm password</label>
        <input
          autoComplete="new-password"
          id="confirm-password"
          type="password"
          {...register('confirmation')}
          aria-describedby={errors.confirmation ? 'confirm-password-error' : undefined}
          aria-invalid={errors.confirmation ? 'true' : undefined}
        />
        {errors.confirmation ? (
          <p className="login__error" id="confirm-password-error">
            {errors.confirmation.message}
          </p>
        ) : null}
      </div>

      <button className="login__submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Saving…' : 'Set password and continue'}
      </button>
    </form>
  )
}
