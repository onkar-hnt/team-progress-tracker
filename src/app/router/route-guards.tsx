import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { canManageTeam } from '@services/auth/index'

/**
 * Blocks unauthenticated access and remembers where the user was going.
 *
 * The attempted path travels in navigation state so that signing in returns
 * the user to it instead of dumping everybody on the dashboard.
 */
export function RequireAuth() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return (
      <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to="/login" />
    )
  }

  return <Outlet />
}

/**
 * Restricts a branch of the route tree to the mentor.
 *
 * Signed-in users get an explanation rather than a redirect, because bouncing
 * someone silently to the dashboard reads as a broken link.
 *
 * This is a usability boundary, not a security one: with hardcoded
 * credentials in the bundle, real enforcement has to live in the backend that
 * eventually serves the data.
 */
export function RequireAdmin() {
  const { user } = useAuth()

  if (!canManageTeam(user)) {
    return (
      <PagePlaceholder
        description="This area is available to the team mentor only."
        title="Not available"
      />
    )
  }

  return <Outlet />
}
