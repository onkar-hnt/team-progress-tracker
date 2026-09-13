import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import type { AppUser, SignInCredentials } from '@models/user.model'
import { getAuthProvider } from '@services/auth/index'

import { AuthContext } from './auth-context'
import type { AuthContextValue } from './auth-context'

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
        // Failed restore is signed-out, not a crash.
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

  /** Sync session changes from other tabs or expiry. */
  useEffect(() => {
    return authProvider.onSessionChange?.((nextUser) => {
      setUser(nextUser)

      if (nextUser === null) queryClient.clear()
    })
  }, [authProvider, queryClient])

  const signIn = useCallback(
    async (credentials?: SignInCredentials) => {
      const signedIn = await authProvider.signIn(credentials)
      setUser(signedIn)
      return signedIn
    },
    [authProvider],
  )

  const refreshUser = useCallback(async () => {
    if (authProvider.refreshIdentity === undefined) return

    setUser(await authProvider.refreshIdentity())
  }, [authProvider])

  const signOut = useCallback(async () => {
    await authProvider.signOut()
    setUser(null)
    // Drop cached data from the previous session.
    queryClient.clear()
  }, [authProvider, queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isRestoring,
      usesCredentials: authProvider.usesCredentials,
      isOffline: authProvider.isOffline,
      signIn,
      signOut,
      refreshUser,
    }),
    [authProvider, isRestoring, refreshUser, signIn, signOut, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
