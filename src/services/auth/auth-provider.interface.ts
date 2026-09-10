import type { AppUser, SignInCredentials } from '@models/user.model'

/**
 * The single boundary between the application and its identity source.
 *
 * Two implementations exist: single sign-on through Microsoft Entra, and a
 * fallback that checks the workbook directly for deployments where the app
 * registration does not exist yet. Neither holds account data of its own —
 * both resolve identity and role from the workbook — so switching between
 * them changes how a person proves who they are, never what they may see.
 */
export interface AuthProvider {
  readonly name: string

  /** Whether accounts can be signed in without a network round trip. */
  readonly isOffline: boolean

  /**
   * Whether sign-in expects an email and password.
   *
   * `false` means identity is delegated to an external provider, and the
   * login screen should offer a single sign-in action instead of a form.
   */
  readonly usesCredentials: boolean

  /**
   * Resolves to the signed-in user, or throws an `AuthError`.
   *
   * `credentials` is required when `usesCredentials` is `true` and ignored
   * otherwise, since a delegated provider collects them itself.
   */
  signIn(credentials?: SignInCredentials): Promise<AppUser>

  signOut(): Promise<void>

  /**
   * Rehydrates a session on startup.
   *
   * Asynchronous because both implementations have to re-read the workbook to
   * confirm the person's role rather than trusting a stored copy of it, and
   * because single sign-on needs a silent token request.
   */
  restoreSession(): Promise<AppUser | null>
}
