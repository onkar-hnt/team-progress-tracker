import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { PasswordField, TextField } from '@components/ui/field/Field'
import { FullPageLoader } from '@components/ui/full-page-loader/FullPageLoader'
import { APP_NAME } from '@constants/app.constants'
import { bootstrapAdmin } from '@services/auth/bootstrap-admin'
import { logFailure, toFeatureMessage, toUserMessage } from '@services/errors/error-message'

import './LoginPage.scss'

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

export function LoginPage() {
  const { isAuthenticated, isOffline, isRestoring, signIn, usesCredentials } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const snackbar = useSnackbar()
  const [signInError, setSignInError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const redirectTo = (location.state as LocationState | null)?.from ?? '/dashboard'

  if (isRestoring) return <FullPageLoader label="Checking your session…" />
  if (isAuthenticated) return <Navigate replace to={redirectTo} />

  const reportError = (error: unknown) => {
    logFailure('sign in', error)

    const message = toUserMessage(error, 'Something went wrong. Please try again.')

    setSignInError(message)

    const snackbarMessage = toFeatureMessage(error, 'Something went wrong. Please try again.')

    if (snackbarMessage !== null) snackbar.error(snackbarMessage)
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
          <span className="login__eyebrow">{APP_NAME}</span>
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
            <Button
              disabled={isSigningIn}
              onClick={() => void signInWithMicrosoft()}
              variant="secondary"
            >
              <MicrosoftLogo />
              {isSigningIn ? 'Opening Microsoft sign-in…' : 'Sign in with Microsoft'}
            </Button>

            <p className="login__hint">
              A sign-in window will open. Your access is based on your entry on the team roster.
            </p>
          </div>
        )}

        {signInError === null ? null : <p className="form__alert">{signInError}</p>}

        <footer className="login__footer">
          {usesCredentials && isOffline && bootstrapAdmin.isUsingDefaultPassword ? (
            <>
              Everyone else signs in with their roster details. For the very first
              sign-in, before anyone has been added, use <code>{bootstrapAdmin.email}</code> with
              the built-in administrator password.
            </>
          ) : (
            'Trouble signing in? Contact your administrator.'
          )}
        </footer>
      </section>
    </main>
  )
}

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
      <TextField
        autoComplete="username"
        error={errors.email?.message}
        id="login-email"
        label="Email"
        placeholder="you@company.com"
        type="email"
        {...register('email')}
      />

      <PasswordField
        autoComplete="current-password"
        error={errors.password?.message}
        id="login-password"
        label="Password"
        {...register('password')}
      />

      <Button isLoading={isSubmitting} type="submit" variant="primary">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

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
