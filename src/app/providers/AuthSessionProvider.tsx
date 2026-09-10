import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import type { AppUser, SignInCredentials } from '@models/user.model'
import {
  initialiseAdminWorkbook,
  resetAdminWorkbookInitialisation,
} from '@services/admin/admin-workbook-initialisation'
import { getAuthProvider } from '@services/auth/index'
import { isAdmin } from '@services/auth/permissions'

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

  /**
   * Prepares the Admin workbook once a session belonging to an administrator
   * exists, whether it was just signed into or restored on load.
   *
   * Deliberately not awaited. Authentication has already succeeded at this
   * point, and holding the session open on a workbook check would let a Graph
   * timeout look like a rejected sign-in. Progress and failures go to the
   * data-source status instead, which the shell already displays.
   *
   * `initialiseAdminWorkbook` is itself guarded, so StrictMode's second
   * effect pass and any re-render of this provider share one run.
   */
  useEffect(() => {
    if (!isAdmin(user)) return

    void initialiseAdminWorkbook()
  }, [user])

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
    // The next administrator to sign in gets a fresh check, rather than
    // inheriting a result from a session that has ended.
    resetAdminWorkbookInitialisation()
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
