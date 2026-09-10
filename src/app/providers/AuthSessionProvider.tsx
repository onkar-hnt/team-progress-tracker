import { useCallback, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import type { AppUser, SignInCredentials } from '@models/user.model'
import { getAuthProvider } from '@services/auth/index'

import { AuthContext } from './auth-context'
import type { AuthContextValue } from './auth-context'

/**
 * Holds the signed-in user for the application.
 *
 * The session is restored synchronously during the first render so a refresh
 * does not flash the login screen for an already signed-in user.
 */
export function AuthSessionProvider({ children }: PropsWithChildren) {
  const authProvider = getAuthProvider()
  const queryClient = useQueryClient()

  const [user, setUser] = useState<AppUser | null>(() => authProvider.restoreSession())

  const signIn = useCallback(
    async (credentials: SignInCredentials) => {
      const signedIn = await authProvider.signIn(credentials)
      setUser(signedIn)
      return signedIn
    },
    [authProvider],
  )

  const signOut = useCallback(async () => {
    await authProvider.signOut()
    setUser(null)
    // Cached team data belongs to the previous session, so drop it rather
    // than let the next user briefly see it.
    queryClient.clear()
  }, [authProvider, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, signIn, signOut }),
    [signIn, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
