import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import type { AppUser, SignInCredentials } from '@models/user.model'
import { getAuthProvider } from '@services/auth/index'

import { AuthContext } from './auth-context'
import type { AuthContextValue } from './auth-context'

/**
 * Holds the signed-in user for the application.
 *
 * Restoring is asynchronous because the role is re-read from the workbook
 * rather than trusted from storage, so a change of access in Excel takes
 * effect on the next load. Until it resolves, `isRestoring` keeps the route
 * guards from treating an unrestored session as signed out.
 */
export function AuthSessionProvider({ children }: PropsWithChildren) {
  const authProvider = getAuthProvider()
  const queryClient = useQueryClient()

  const [user, setUser] = useState<AppUser | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)

  useEffect(() => {
    let isCurrent = true

    const restore = async () => {
      try {
        const restored = await authProvider.restoreSession()
        if (isCurrent) setUser(restored)
      } catch {
        // A failed restore is a signed-out state, not a crash: the login page
        // will report the reason if the person tries again.
        if (isCurrent) setUser(null)
      } finally {
        if (isCurrent) setIsRestoring(false)
      }
    }

    void restore()

    return () => {
      isCurrent = false
    }
  }, [authProvider])

  const signIn = useCallback(
    async (credentials?: SignInCredentials) => {
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
    () => ({
      user,
      isAuthenticated: user !== null,
      isRestoring,
      usesCredentials: authProvider.usesCredentials,
      signIn,
      signOut,
    }),
    [authProvider, isRestoring, signIn, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
