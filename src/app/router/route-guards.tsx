import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { FullPageLoader } from '@components/ui/feedback/Feedback'
import { useAccessScope, useMentorAssignments } from '@hooks/use-access-scope'
import type { AppUser } from '@models/index'
import { canManageTeam, canReadFeedback, canViewTeamData } from '@services/auth/index'

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
 * Holds everything back until a handed-out password has been replaced.
 *
 * Accounts created from the Employees screen start with a password derived
 * from the holder's name, so it is known to whoever created it and guessable
 * by anyone who knows the rule. Left alone, that temporary password stays in
 * use indefinitely — so nothing is reachable until it is changed.
 *
 * The password screen sits outside `RequireAuth`, so sending people there
 * cannot loop back through this guard.
 */
export function RequirePasswordChange() {
  const { user } = useAuth()

  if (user?.mustChangePassword === true) return <Navigate replace to="/set-password" />

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

/** The roster screens: admins and mentors. */
export function RequireTeamManagement() {
  return (
    <RequireRole
      description="This area is available to mentors and administrators."
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

/**
 * The feedback screen: mentors and admins write it, developers read their own.
 *
 * The guard is wider than the screen's write controls, which ask
 * `canWriteFeedback` separately. What it still blocks is an account linked to
 * neither a mentor record nor an employee record, which has nothing to read
 * and nobody to attribute a note to.
 */
export function RequireFeedbackAccess() {
  return (
    <RequireRole
      description="Feedback is written by mentors and read by the developer it is about. This account is linked to neither, so there is nothing to show."
      isAllowed={canReadFeedback}
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

  // The query the scope is built from, so a failure here can be retried in
  // place. This guard stands in front of the shell, so the refresh in the
  // header is not on screen to be pressed.
  const assignmentsQuery = useMentorAssignments()

  if (isResolving) return <FullPageLoader label="Loading your workspace…" />

  if (error !== null) {
    return (
      <PagePlaceholder
        action={
          <button
            className="button button--primary"
            disabled={assignmentsQuery.isFetching}
            onClick={() => void assignmentsQuery.refetch()}
            type="button"
          >
            {assignmentsQuery.isFetching ? 'Retrying…' : 'Try again'}
          </button>
        }
        description="Your access could not be confirmed, so nothing is shown."
        title="Access unavailable"
      />
    )
  }

  return <Outlet />
}
