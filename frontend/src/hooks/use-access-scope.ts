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

/**
 * The projects a mentor is responsible for. Read straight from the server
 * rather than derived from the project list, because the project list is
 * itself narrowed by this answer.
 */
export function useResponsibleProjectIds(): UseQueryResult<string[]> {
  const { isRestoring, user } = useAuth()
  const service = getWorkTrackerService()

  return useQuery({
    queryKey: [...queryKeys.responsibleProjects(), user?.email ?? 'none'],
    queryFn: () => service.getResponsibleProjectIds(user),
    enabled: !isRestoring && user?.role === 'mentor',
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
  const projectsQuery = useResponsibleProjectIds()

  const needsAssignments = user?.role === 'mentor'

  if (isRestoring || user === null) {
    return { scope: null, isResolving: isRestoring, error: null }
  }

  // Both reads have to land before a mentor's scope means anything: an empty
  // project list would otherwise read as responsible for nothing.
  if (needsAssignments && (assignmentsQuery.isPending || projectsQuery.isPending)) {
    return { scope: null, isResolving: true, error: null }
  }

  return {
    scope: buildAccessScope(user, assignmentsQuery.data ?? [], projectsQuery.data ?? []),
    isResolving: false,
    error: needsAssignments ? (assignmentsQuery.error ?? projectsQuery.error) : null,
  }
}
