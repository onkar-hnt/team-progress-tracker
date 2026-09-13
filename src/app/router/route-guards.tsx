import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Button } from '@components/ui/button/Button'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { FullPageLoader } from '@components/ui/full-page-loader/FullPageLoader'
import { useAccessScope, useMentorAssignments } from '@hooks/use-access-scope'
import type { AppUser } from '@models/index'
import { canManageTeam, canReadFeedback, canViewTeamData, isAdmin } from '@services/auth/index'

/** Redirects unauthenticated users; waits during session restore. */
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

/** Redirects accounts that must replace a temporary password. */
export function RequirePasswordChange() {
  const { user } = useAuth()

  if (user?.mustChangePassword === true) return <Navigate replace to="/set-password" />

  return <Outlet />
}

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

export function RequireTeamManagement() {
  return (
    <RequireRole
      description="This area is available to mentors and administrators."
      isAllowed={canManageTeam}
    />
  )
}

export function RequireAdmin() {
  return (
    <RequireRole
      description="Logins are administered by administrators. Mentors can create a login and reset a password from the Employees and Mentors screens."
      isAllowed={isAdmin}
    />
  )
}

export function RequireTeamAccess() {
  return (
    <RequireRole
      description="This area is available to mentors and administrators. Your own progress is on the dashboard."
      isAllowed={canViewTeamData}
    />
  )
}

export function RequireFeedbackAccess() {
  return (
    <RequireRole
      description="Feedback is written by mentors and read by the developer it is about. This account is linked to neither, so there is nothing to show."
      isAllowed={canReadFeedback}
    />
  )
}

/** Waits for access scope before scoped screens render. */
export function RequireScope() {
  const { error, isResolving } = useAccessScope()

  // Retry here because this guard sits ahead of the shell refresh control.
  const assignmentsQuery = useMentorAssignments()

  if (isResolving) return <FullPageLoader label="Loading your workspace…" />

  if (error !== null) {
    return (
      <PagePlaceholder
        action={
          <Button
            disabled={assignmentsQuery.isFetching}
            onClick={() => void assignmentsQuery.refetch()}
            variant="primary"
          >
            {assignmentsQuery.isFetching ? 'Retrying…' : 'Try again'}
          </Button>
        }
        description="Your access could not be confirmed, so nothing is shown."
        title="Access unavailable"
      />
    )
  }

  return <Outlet />
}
