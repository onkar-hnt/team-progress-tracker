import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import type { MentorAssignment } from '@models/index'
import { buildAccessScope } from '@services/auth/index'
import type { AccessScope } from '@services/auth/index'
import { getWorkTrackerService } from '@services/work-tracker.service'

import { queryKeys } from './query-keys'

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

  /** Data hooks stay disabled until scope is resolved. */
  isResolving: boolean

  error: Error | null
}

export function useAccessScope(): AccessScopeState {
  const { isRestoring, user } = useAuth()
  const assignmentsQuery = useMentorAssignments()

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
