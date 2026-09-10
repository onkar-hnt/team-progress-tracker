import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { FullPageLoader } from '@components/ui/feedback/Feedback'
import { useAccessScope } from '@hooks/use-access-scope'
import type { AppUser } from '@models/index'
import { canManageTeam, canViewTeamData, canWriteFeedback } from '@services/auth/index'

/**
 * Blocks unauthenticated access and remembers where the user was going.
 *
 * The attempted path travels in navigation state so that signing in returns
 * the user to it instead of dumping everybody on the dashboard.
 *
 * Nothing is decided while the session is being restored: redirecting during
 * that window would sign people out on every refresh.
 */
export function RequireAuth() {
  const { isAuthenticated, isRestoring } = useAuth()
  const location = useLocation()

  if (isRestoring) return <FullPageLoader label="Restoring your session…" />

  if (!isAuthenticated) {
    return (
      <Navigate replace state={{ from: `${location.pathname}${location.search}` }} to="/login" />
    )
  }

  return <Outlet />
}

/**
 * Restricts a branch of the route tree by role.
 *
 * Signed-in users get an explanation rather than a redirect, because bouncing
 * someone silently to the dashboard reads as a broken link.
 *
 * Route guards keep whole areas out of reach, but they are not what protects
 * individual records: that is the access scope applied inside the data hooks,
 * which narrows every query to what the signed-in person may see.
 */
function RequireRole({
  description,
  isAllowed,
}: {
  description: string
  isAllowed: (user: AppUser | null) => boolean
}) {
  const { user } = useAuth()

  if (!isAllowed(user)) {
    return <PagePlaceholder description={description} title="Not available" />
  }

  return <Outlet />
}

export function RequireAdmin() {
  return (
    <RequireRole
      description="This area is available to administrators only."
      isAllowed={canManageTeam}
    />
  )
}

/** Screens that list more than one person: admins and mentors. */
export function RequireTeamAccess() {
  return (
    <RequireRole
      description="This area is available to mentors and administrators. Your own progress is on the dashboard."
      isAllowed={canViewTeamData}
    />
  )
}

/** Writing feedback: mentors, and admins acting on their behalf. */
export function RequireFeedbackAccess() {
  return (
    <RequireRole
      description="Feedback is written by mentors and administrators."
      isAllowed={canWriteFeedback}
    />
  )
}

/**
 * Waits for the access scope before rendering scoped screens.
 *
 * Without this, a screen could briefly render with no scope and show its
 * empty state before the real data arrives, which looks like data loss.
 */
export function RequireScope() {
  const { error, isResolving } = useAccessScope()

  if (isResolving) return <FullPageLoader label="Loading your workspace…" />

  if (error !== null) {
    return (
      <PagePlaceholder
        description="Your access could not be confirmed, so nothing is shown. Refresh to try again."
        title="Access unavailable"
      />
    )
  }

  return <Outlet />
}
