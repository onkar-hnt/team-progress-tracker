import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { useAuth } from '@app/providers/auth-context'
import { MENTOR } from '@constants/team.constants'
import { AuthError } from '@services/auth/index'

import './LoginPage.scss'

/**
 * A permissive email check. The account list is the real gate, so this only
 * needs to catch obvious typos before a pointless sign-in attempt.
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

export function LoginPage() {
  const { isAuthenticated, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [signInError, setSignInError] = useState<string | null>(null)

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  // Where the user was heading before the guard intercepted them.
  const redirectTo = (location.state as LocationState | null)?.from ?? '/dashboard'

  if (isAuthenticated) return <Navigate replace to={redirectTo} />

  const onSubmit = handleSubmit(async (values) => {
    setSignInError(null)

    try {
      await signIn(values)
      void navigate(redirectTo, { replace: true })
    } catch (error) {
      setSignInError(
        error instanceof AuthError ? error.message : 'Something went wrong. Please try again.',
      )
    }
  })

  return (
    <main className="login">
      <section className="login__card">
        <header className="login__header">
          <span className="login__eyebrow">Team Progress Tracker</span>
          <h1 className="login__title">Sign in</h1>
          <p className="login__subtitle">
            Use your work email to record and review daily progress.
          </p>
        </header>

        <form className="login__form" noValidate onSubmit={onSubmit}>
          <div className="login__field">
            <label htmlFor="login-email">Email</label>
            <input
              autoComplete="username"
              id="login-email"
              placeholder="name@handt.ai"
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

          {/* Assertive so a screen reader announces a rejected sign-in immediately. */}
          <div aria-live="assertive" role="status">
            {signInError === null ? null : <p className="login__alert">{signInError}</p>}
          </div>

          <button className="login__submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <footer className="login__footer">
          Trouble signing in? Contact {MENTOR.name}.
        </footer>
      </section>
    </main>
  )
}
