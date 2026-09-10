import { createContext, useContext } from 'react'

import type { AppUser, SignInCredentials } from '@models/user.model'

export interface AuthContextValue {
  user: AppUser | null
  isAuthenticated: boolean

  /** Throws an `AuthError` when the credentials are rejected. */
  signIn: (credentials: SignInCredentials) => Promise<AppUser>

  signOut: () => Promise<void>
}

/**
 * `undefined` marks "no provider mounted", which is a wiring bug rather than
 * a signed-out state. Signed out is `user === null`.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used inside <AuthSessionProvider>.')
  }

  return context
}
