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

function useResponsibleProjectIds(): UseQueryResult<string[]> {
  const { isRestoring, user } = useAuth()
  const service = getWorkTrackerService()
  const mentorId = user?.role === 'mentor' ? user.mentorId : undefined

  return useQuery({
    queryKey: [...queryKeys.responsibleProjects(), mentorId ?? 'none'],
    queryFn: () => {
      if (mentorId === undefined) return []
      return service.getResponsibleProjectIds(mentorId)
    },
    enabled: !isRestoring && mentorId !== undefined,
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
  const needsProjects = user?.role === 'mentor' && user.mentorId !== undefined

  if (isRestoring || user === null) {
    return { scope: null, isResolving: isRestoring, error: null }
  }

  if (
    (needsAssignments && assignmentsQuery.isPending) ||
    (needsProjects && projectsQuery.isPending)
  ) {
    return { scope: null, isResolving: true, error: null }
  }

  const error =
    (needsAssignments ? assignmentsQuery.error : null) ??
    (needsProjects ? projectsQuery.error : null)

  return {
    scope: buildAccessScope(user, assignmentsQuery.data ?? [], projectsQuery.data ?? []),
    isResolving: false,
    error,
  }
}
