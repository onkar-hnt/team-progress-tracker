import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useAuth } from '@app/providers/auth-context'
import { FullPageLoader } from '@components/ui/feedback/Feedback'
import { AuthError } from '@services/auth/index'

import './LoginPage.scss'

/**
 * A permissive email check. The workbook is the real gate, so this only needs
 * to catch obvious typos before a pointless sign-in attempt.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const loginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: 'Email is required' })
    .refine((value) => EMAIL_PATTERN.test(value), { message: 'Enter a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
})

type LoginFormValues = z.infer<typeof loginFormSchema>

interface LocationState {
  from?: string
}

/**
 * Sign-in screen.
 *
 * Renders one of two things depending on how the deployment is configured: a
 * Microsoft sign-in button, or the workbook password form used before an app
 * registration exists. The choice comes from the auth provider rather than
 * from configuration read here, so there is one source of truth for it.
 */
export function LoginPage() {
  const { isAuthenticated, isRestoring, signIn, usesCredentials } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [signInError, setSignInError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  // Where the user was heading before the guard intercepted them.
  const redirectTo = (location.state as LocationState | null)?.from ?? '/dashboard'

  if (isRestoring) return <FullPageLoader label="Checking your session…" />
  if (isAuthenticated) return <Navigate replace to={redirectTo} />

  const reportError = (error: unknown) => {
    setSignInError(
      error instanceof AuthError ? error.message : 'Something went wrong. Please try again.',
    )
  }

  const signInWithMicrosoft = async () => {
    setSignInError(null)
    setIsSigningIn(true)

    try {
      await signIn()
      void navigate(redirectTo, { replace: true })
    } catch (error) {
      reportError(error)
    } finally {
      setIsSigningIn(false)
    }
  }

  return (
    <main className="login">
      <section className="login__card">
        <header className="login__header">
          <span className="login__eyebrow">Team Progress Tracker</span>
          <h1 className="login__title">Sign in</h1>
          <p className="login__subtitle">
            {usesCredentials
              ? 'Use your work email to record and review daily progress.'
              : 'Sign in with your work account to record and review daily progress.'}
          </p>
        </header>

        {usesCredentials ? (
          <PasswordForm onError={reportError} onSignedIn={() => void navigate(redirectTo, { replace: true })} />
        ) : (
          <div className="login__form">
            <button
              className="login__submit login__submit--microsoft"
              disabled={isSigningIn}
              onClick={() => void signInWithMicrosoft()}
              type="button"
            >
              <MicrosoftLogo />
              {isSigningIn ? 'Opening Microsoft sign-in…' : 'Sign in with Microsoft'}
            </button>

            <p className="login__hint">
              A sign-in window will open. Your access is based on your entry in the team workbook.
            </p>
          </div>
        )}

        {/* Assertive so a screen reader announces a rejected sign-in immediately. */}
        <div aria-live="assertive" role="status">
          {signInError === null ? null : <p className="login__alert">{signInError}</p>}
        </div>

        <footer className="login__footer">
          Trouble signing in? Contact your administrator.
        </footer>
      </section>
    </main>
  )
}

/** The fallback form, used only when single sign-on is not configured. */
function PasswordForm({
  onError,
  onSignedIn,
}: {
  onError: (error: unknown) => void
  onSignedIn: () => void
}) {
  const { signIn } = useAuth()

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signIn(values)
      onSignedIn()
    } catch (error) {
      onError(error)
    }
  })

  return (
    <form className="login__form" noValidate onSubmit={onSubmit}>
      <div className="login__field">
        <label htmlFor="login-email">Email</label>
        <input
          autoComplete="username"
          id="login-email"
          placeholder="you@company.com"
          type="email"
          {...register('email')}
          aria-describedby={errors.email ? 'login-email-error' : undefined}
          aria-invalid={errors.email ? 'true' : undefined}
        />
        {errors.email ? (
          <p className="login__error" id="login-email-error">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="login__field">
        <label htmlFor="login-password">Password</label>
        <input
          autoComplete="current-password"
          id="login-password"
          type="password"
          {...register('password')}
          aria-describedby={errors.password ? 'login-password-error' : undefined}
          aria-invalid={errors.password ? 'true' : undefined}
        />
        {errors.password ? (
          <p className="login__error" id="login-password-error">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <button className="login__submit" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

/** The Microsoft mark, whose four squares are required to be shown in colour. */
function MicrosoftLogo() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 23 23" width="18">
      <path d="M1 1h10v10H1z" fill="#f25022" />
      <path d="M12 1h10v10H12z" fill="#7fba00" />
      <path d="M1 12h10v10H1z" fill="#00a4ef" />
      <path d="M12 12h10v10H12z" fill="#ffb900" />
    </svg>
  )
}
