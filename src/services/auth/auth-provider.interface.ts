import type { AppUser, SignInCredentials } from '@models/user.model'

export interface AuthProvider {
  readonly name: string

  /** Whether accounts can be signed in without a network round trip. */
  readonly isOffline: boolean

  readonly usesCredentials: boolean

  signIn(credentials?: SignInCredentials): Promise<AppUser>

  signOut(): Promise<void>

  restoreSession(): Promise<AppUser | null>

  refreshIdentity?(): Promise<AppUser | null>

  onSessionChange?(listener: (user: AppUser | null) => void): () => void
}
