import { createContext, useContext } from 'react'

import type { AppUser, SignInCredentials } from '@models/user.model'

export interface AuthContextValue {
  user: AppUser | null
  isAuthenticated: boolean

  /**
   * `true` while the stored session is being re-checked against the workbook.
   *
   * Guards must wait for this rather than redirecting, or a refresh would
   * bounce a signed-in person to the login page.
   */
  isRestoring: boolean

  /** `false` when sign-in is delegated, so the form should not be shown. */
  usesCredentials: boolean

  /** Throws an `AuthError` when sign-in is rejected. */
  signIn: (credentials?: SignInCredentials) => Promise<AppUser>

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
