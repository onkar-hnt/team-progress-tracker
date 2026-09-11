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

  /**
   * Re-reads the current identity, bypassing any caching or de-duplication.
   *
   * Distinct from `restoreSession`, which exists to answer "is there a
   * session?" cheaply on startup and is free to share an answer already being
   * fetched. This exists to answer "what changed just now?", so an in-flight
   * read started before the change is exactly the answer it must not return.
   *
   * Optional: a provider whose identity cannot change mid-session has nothing
   * to re-read, and callers must cope with its absence.
   */
  refreshIdentity?(): Promise<AppUser | null>

  /**
   * Reports identity changes this application did not initiate.
   *
   * Sign-in and sign-out through `signIn` and `signOut` are already reflected
   * by their return values; this exists for changes that happen elsewhere —
   * another tab signing out, or a session expiring beyond recovery — so the
   * open page does not keep rendering a session that has ended.
   *
   * Returns an unsubscribe function. Optional: a provider whose accounts live
   * in a workbook has nothing to observe, and callers must cope with its
   * absence rather than assume a subscription exists.
   */
  onSessionChange?(listener: (user: AppUser | null) => void): () => void
}
