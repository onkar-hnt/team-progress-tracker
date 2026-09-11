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

/**
 * Sign-in through Supabase Auth, with the role read from `public.profiles`.
 *
 * This is the production identity source. It replaces the built-in
 * administrator credentials in `bootstrap-admin.ts`, which are reachable only
 * from `LocalAuthProvider` and therefore cannot participate here: a rejected
 * Supabase sign-in raises an error, and there is no path from this class to
 * the offline provider.
 *
 * The session itself is Supabase's to keep. It lives in `localStorage` under
 * the client's own key and is refreshed in the background, so nothing in this
 * application stores a token, and `session-store.ts` — the sessionStorage
 * email used by the workbook providers — is deliberately untouched.
 *
 * SECURITY: no token, refresh token or password is logged, returned or
 * embedded in an error message. Failures carry the provider's error as
 * `cause`, which keeps the detail available to a developer inspecting it
 * without putting credentials into a rendered message.
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly name = 'supabase'

  /** Every operation is a network call, so a session is never assumed. */
  readonly isOffline = false

  readonly usesCredentials = true

  /**
   * The user whose profile was most recently resolved.
   *
   * Supabase raises `SIGNED_IN` for sign-ins this class performed as well as
   * for those it did not, so without this the profile would be fetched twice
   * for every login. Comparing ids means the subscription only does work when
   * the identity actually changed — another tab signing in, or a session
   * appearing after this one started.
   */
  private lastResolvedUserId: string | null = null

  /**
   * The identity resolution currently in progress, if any.
   *
   * Three things ask for the same identity within a few milliseconds of a
   * page load, and each would otherwise issue its own profile, mentor and
   * developer queries:
   *
   * 1. `restoreSession`, from the provider's restore effect.
   * 2. `restoreSession` again, because StrictMode runs effects twice. The
   *    existing `isCurrent` guard suppresses the duplicate *state update*,
   *    not the duplicate request.
   * 3. `SIGNED_IN`, which `auth-js` raises from `_recoverAndRefresh()` when
   *    it loads a stored session during client initialisation — startup does
   *    not arrive as `INITIAL_SESSION`, despite the name.
   *
   * `lastResolvedUserId` cannot collapse these on its own: all three begin
   * before any of them finishes, so there is nothing yet to compare against.
   * Sharing the promise is what makes the count independent of how many
   * callers there happen to be.
   */
  private pendingResolution: {
    readonly userId: string
    readonly promise: Promise<AppUser>
  } | null = null

  /**
   * Translates configuration problems into an auth error.
   *
   * Configuration is validated rather than assumed so that a deployment
   * missing its environment says so, instead of failing later as an opaque
   * network error against an empty URL.
   */
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
    // The login form always supplies these; a delegated caller reaching here
    // without them is a wiring mistake, reported as a rejected sign-in rather
    // than a crash.
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
      // Credentials were valid, so Supabase now holds a session for somebody
      // the application cannot authorise. Leaving it in place would restore
      // the same dead end on every reload, so the session is discarded and
      // the person is told why.
      await this.discardSession(client)
      throw identityError
    }
  }

  async signOut(): Promise<void> {
    this.lastResolvedUserId = null

    // Unconfigured means there is no session to end, which is the state
    // sign-out is trying to reach — so this is success, not an error.
    let client: AppSupabaseClient
    try {
      client = this.client()
    } catch {
      return
    }

    // The result is deliberately ignored. supabase-js clears the persisted
    // session before the network call, so a failed revocation still leaves
    // the browser signed out — and reporting it would strand somebody in a
    // session they have already left.
    await client.auth.signOut()
  }

  async restoreSession(): Promise<AppUser | null> {
    return this.readCurrentIdentity(false)
  }

  async refreshIdentity(): Promise<AppUser | null> {
    return this.readCurrentIdentity(true)
  }

  /**
   * The identity behind the persisted session, or `null` if there is none.
   *
   * `forced` discards any resolution already in flight. Startup wants the
   * opposite — three callers asking at once should cost one round trip — but
   * a caller re-reading after a change it just made would otherwise be handed
   * the answer to the older question.
   */
  private async readCurrentIdentity(forced: boolean): Promise<AppUser | null> {
    let client: AppSupabaseClient
    try {
      client = this.client()
    } catch {
      // Nothing to restore, and the login screen will explain the
      // misconfiguration as soon as somebody tries to sign in.
      return null
    }

    // Reads the persisted session and refreshes the token if it has expired.
    const { data, error } = await client.auth.getSession()

    if (error !== null || data.session === null) return null

    if (forced) this.pendingResolution = null

    try {
      return await this.resolve(data.session.user)
    } catch {
      // A session whose profile has since been removed or deactivated is not
      // a usable session. Treated as signed out rather than surfaced, because
      // a page load is not a sign-in attempt.
      await this.discardSession(client)
      return null
    }
  }

  /**
   * Reflects identity changes that happened outside this provider.
   *
   * Covers signing out in another tab, a session arriving after startup, and
   * an account being updated.
   *
   * `INITIAL_SESSION` is ignored because `restoreSession` handles startup,
   * and `TOKEN_REFRESHED` because a new token does not change who somebody
   * is — which matters, since an hourly refresh would otherwise re-read the
   * profile and re-render the whole app for no reason.
   *
   * `SIGNED_IN` cannot be ignored the same way even though it *is* raised at
   * startup, by `_recoverAndRefresh()`: it is also the only signal that
   * another tab signed in. It is therefore accepted and de-duplicated,
   * against both the resolution in flight and the last one completed.
   */
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

      // supabase-js holds an internal lock while this callback runs, and
      // calling back into the client from inside it can deadlock. Deferring
      // to a fresh task is the documented way to do further work.
      setTimeout(() => {
        void (async () => {
          try {
            listener(await this.resolve(user))
          } catch {
            // The session exists but cannot be authorised. Reported as signed
            // out; the session is left for `signIn` to clear, so that a
            // transient profile read failure in a background tab does not
            // evict a working session elsewhere.
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

    // Same person, already being resolved: join that attempt rather than
    // starting a second one. A *different* id means the identity changed
    // mid-flight, which has to be resolved on its own.
    if (pending !== null && pending.userId === authUser.id) return pending.promise

    const promise = this.readIdentity(authUser)
    this.pendingResolution = { userId: authUser.id, promise }

    try {
      return await promise
    } finally {
      // Only clears this attempt. A resolution for a newer identity may have
      // replaced it while this one was settling, and discarding that would
      // reintroduce the duplicate it is preventing.
      if (this.pendingResolution?.promise === promise) this.pendingResolution = null
    }
  }

  private async readIdentity(authUser: SupabaseAuthUser): Promise<AppUser> {
    // Claimed before awaiting, not after, so that a `SIGNED_IN` arriving
    // after this resolution completes — a cross-tab broadcast, say — is
    // recognised as the same identity and skipped.
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

/**
 * Maps a Supabase auth failure onto the application's error vocabulary.
 *
 * Components only ever see an `AuthError` subclass, so no PostgREST or GoTrue
 * shape reaches the UI. Wrong credentials stay deliberately vague about
 * whether it was the address or the password.
 */
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

    // 400 and 401 from the token endpoint mean rejected credentials whatever
    // the code says, so they must not surface as an unexplained failure.
    if (error.status === 400 || error.status === 401) return new InvalidCredentialsError()

    return new SignInFailedError('Sign-in was refused. Please try again.', { cause: error })
  }

  return new SignInFailedError('Sign-in could not be completed. Please try again.', {
    cause: error,
  })
}
