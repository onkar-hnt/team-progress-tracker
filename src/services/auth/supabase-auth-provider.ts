import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js'

import type { AppUser, SignInCredentials } from '@models/user.model'
import type { AppSupabaseClient } from '@services/supabase/index'
import { SupabaseConfigurationError, getSupabaseClient } from '@services/supabase/index'

import type { AuthProvider } from './auth-provider.interface'
import {
  AuthConfigurationError,
  InvalidCredentialsError,
  SignInFailedError,
} from './auth.errors'
import { resolveSupabaseIdentity } from './supabase-identity'
import type { SupabaseAuthUser } from './supabase-identity'

export class SupabaseAuthProvider implements AuthProvider {
  readonly name = 'supabase'

  /** Every operation is a network call, so a session is never assumed. */
  readonly isOffline = false

  readonly usesCredentials = true

  private lastResolvedUserId: string | null = null

  private pendingResolution: {
    readonly userId: string
    readonly promise: Promise<AppUser>
  } | null = null

  private client(): AppSupabaseClient {
    try {
      return getSupabaseClient()
    } catch (error) {
      if (error instanceof SupabaseConfigurationError) {
        throw new AuthConfigurationError(error.message, { cause: error })
      }

      throw error
    }
  }

  async signIn(credentials?: SignInCredentials): Promise<AppUser> {
    if (credentials === undefined) throw new InvalidCredentialsError()

    const client = this.client()

    const { data, error } = await client.auth.signInWithPassword({
      email: credentials.email.trim(),
      password: credentials.password,
    })

    if (error !== null) throw mapSupabaseAuthError(error)
    if (data.user === null) throw new InvalidCredentialsError()

    try {
      return await this.resolve(data.user)
    } catch (identityError) {
      await this.discardSession(client)
      throw identityError
    }
  }

  async signOut(): Promise<void> {
    this.lastResolvedUserId = null

    let client: AppSupabaseClient
    try {
      client = this.client()
    } catch {
      return
    }

    await client.auth.signOut()
  }

  async restoreSession(): Promise<AppUser | null> {
    return this.readCurrentIdentity(false)
  }

  async refreshIdentity(): Promise<AppUser | null> {
    return this.readCurrentIdentity(true)
  }

  private async readCurrentIdentity(forced: boolean): Promise<AppUser | null> {
    let client: AppSupabaseClient
    try {
      client = this.client()
    } catch {
      return null
    }

    // Reads the persisted session and refreshes the token if it has expired.
    const { data, error } = await client.auth.getSession()

    if (error !== null || data.session === null) return null

    if (forced) this.pendingResolution = null

    try {
      return await this.resolve(data.session.user)
    } catch {
      await this.discardSession(client)
      return null
    }
  }

  onSessionChange(listener: (user: AppUser | null) => void): () => void {
    let client: AppSupabaseClient
    try {
      client = this.client()
    } catch {
      return () => undefined
    }

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        this.lastResolvedUserId = null
        listener(null)
        return
      }

      if (event !== 'SIGNED_IN' && event !== 'USER_UPDATED') return
      if (session === null) return
      if (event === 'SIGNED_IN' && session.user.id === this.lastResolvedUserId) return

      const { user } = session

      setTimeout(() => {
        void (async () => {
          try {
            listener(await this.resolve(user))
          } catch {
            listener(null)
          }
        })()
      }, 0)
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }

  private async resolve(authUser: SupabaseAuthUser): Promise<AppUser> {
    const pending = this.pendingResolution

    if (pending !== null && pending.userId === authUser.id) return pending.promise

    const promise = this.readIdentity(authUser)
    this.pendingResolution = { userId: authUser.id, promise }

    try {
      return await promise
    } finally {
      if (this.pendingResolution?.promise === promise) this.pendingResolution = null
    }
  }

  private async readIdentity(authUser: SupabaseAuthUser): Promise<AppUser> {
    this.lastResolvedUserId = authUser.id

    try {
      return await resolveSupabaseIdentity(this.client(), authUser)
    } catch (error) {
      // Released again so a retry is not mistaken for the attempt that just
      // failed.
      this.lastResolvedUserId = null
      throw error
    }
  }

  private async discardSession(client: AppSupabaseClient): Promise<void> {
    this.lastResolvedUserId = null

    try {
      await client.auth.signOut()
    } catch {
      // Already unusable; the original failure is the one worth reporting.
    }
  }
}

function mapSupabaseAuthError(error: unknown): Error {
  if (isAuthRetryableFetchError(error)) {
    return new SignInFailedError(
      'Could not reach the sign-in service. Check your connection and try again.',
      { cause: error },
    )
  }

  if (isAuthApiError(error)) {
    switch (error.code) {
      case 'invalid_credentials':
      case 'invalid_grant':
      case 'user_not_found':
        return new InvalidCredentialsError()

      case 'email_not_confirmed':
        return new SignInFailedError(
          'This account has not been confirmed yet. Ask an administrator to confirm it.',
          { cause: error },
        )

      case 'user_banned':
      case 'signup_disabled':
        return new SignInFailedError('This account cannot sign in. Contact your administrator.', {
          cause: error,
        })

      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return new SignInFailedError('Too many attempts. Wait a moment and try again.', {
          cause: error,
        })

      default:
        break
    }

    if (error.status === 400 || error.status === 401) return new InvalidCredentialsError()

    return new SignInFailedError('Sign-in was refused. Please try again.', { cause: error })
  }

  return new SignInFailedError('Sign-in could not be completed. Please try again.', {
    cause: error,
  })
}
