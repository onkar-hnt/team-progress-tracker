import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import type { MentorAssignment } from '@models/index'
import { buildAccessScope } from '@services/auth/index'
import type { AccessScope } from '@services/auth/index'
import { getWorkTrackerService } from '@services/work-tracker.service'

import { queryKeys } from './query-keys'

/**
 * The mentor mapping, needed to resolve what a mentor may see.
 *
 * Fetched separately from the scope so it is cached once and shared by every
 * screen, and so an admin screen can display the mapping directly.
 */
export function useMentorAssignments(): UseQueryResult<MentorAssignment[]> {
  const { isRestoring, user } = useAuth()
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: [...queryKeys.mentorAssignments(), user?.email ?? 'none'],
    queryFn: () => service.getMentorAssignments(user),
    enabled: !isRestoring && user !== null,
    staleTime: 5 * 60_000,
  })
}

export interface AccessScopeState {
  scope: AccessScope | null

  /**
   * `true` until the scope is known.
   *
   * Data hooks stay disabled while this is `true`. That is the mechanism that
   * makes the isolation safe by default: a query cannot run before the limits
   * it must respect have been resolved, so there is no window in which an
   * unscoped request could be issued.
   */
  isResolving: boolean

  error: Error | null
}

export function useAccessScope(): AccessScopeState {
  const { isRestoring, user } = useAuth()
  const assignmentsQuery = useMentorAssignments()

  // Only a mentor's scope depends on the mapping. Admins and developers are
  // resolved immediately, so their screens do not wait on a fetch they do not
  // need.
  const needsAssignments = user?.role === 'mentor'

  if (isRestoring || user === null) {
    return { scope: null, isResolving: isRestoring, error: null }
  }

  if (needsAssignments && assignmentsQuery.isPending) {
    return { scope: null, isResolving: true, error: null }
  }

  return {
    scope: buildAccessScope(user, assignmentsQuery.data ?? []),
    isResolving: false,
    error: needsAssignments ? assignmentsQuery.error : null,
  }
}
