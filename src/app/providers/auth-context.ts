import { createContext, useContext } from 'react'

import type { AppUser, SignInCredentials } from '@models/user.model'

export interface AuthContextValue {
  user: AppUser | null
  isAuthenticated: boolean

  /** Guards must wait or a refresh looks like sign-out. */
  isRestoring: boolean

  usesCredentials: boolean

  /** Offline provider only; controls built-in admin hint on login. */
  isOffline: boolean

  signIn: (credentials?: SignInCredentials) => Promise<AppUser>

  signOut: () => Promise<void>

  /** Re-read role and flags after the app changes them, e.g. password change. */
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used inside <AuthSessionProvider>.')
  }

  return context
}
