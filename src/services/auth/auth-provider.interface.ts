import type { AppUser, SignInCredentials } from '@models/user.model'

/**
 * The single boundary between the application and its identity source.
 *
 * The MVP implementation checks a hardcoded list. Replacing it with real
 * single sign-on means writing one new implementation of this interface and
 * changing the factory; no screen, guard or hook has to change, because
 * nothing above this line knows how a user was authenticated.
 */
export interface AuthProvider {
  readonly name: string

  /** Whether accounts can be signed in without a network round trip. */
  readonly isOffline: boolean

  /** Resolves to the signed-in user, or throws an `AuthError`. */
  signIn(credentials: SignInCredentials): Promise<AppUser>

  signOut(): Promise<void>

  /**
   * Rehydrates a session synchronously on startup.
   *
   * Returning synchronously avoids a flash of the login page on refresh for
   * users who are already signed in.
   */
  restoreSession(): AppUser | null
}
