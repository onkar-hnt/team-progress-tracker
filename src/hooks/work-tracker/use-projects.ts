import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type { CreateProjectRequest, Project, UpdateProjectRequest } from '@models/index'
import { getWorkTrackerService } from '@services/work-tracker.service'

import { queryKeys } from '../query-keys'
import { ROSTER_STALE_TIME, useScopedQuery, useWorkTrackerMutation } from './scoped-query'
import type { UpdateVariables } from './scoped-query'

export function useProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.projects(), scopeId],
    (scope) => service.getProjects(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useActiveProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.projects(), 'active', scopeId],
    (scope) => service.getActiveProjects(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useRosterProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.roster('projects'), scopeId],
    (scope) => service.getRosterProjects(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useActiveRosterProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.roster('projects'), 'active', scopeId],
    (scope) => service.getActiveRosterProjects(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useCreateProject(): UseMutationResult<Project, Error, CreateProjectRequest> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (request: CreateProjectRequest) => service.createProject(request),
    'roster',
    'The project could not be created. Please try again.',
  )
}

export function useUpdateProject(): UseMutationResult<
  Project,
  Error,
  UpdateVariables<UpdateProjectRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ changes, id }: UpdateVariables<UpdateProjectRequest>) => service.updateProject(id, changes),
    'roster',
    'The project could not be saved. Please try again.',
  )
}

export function useDeleteProject(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.deleteProject(id),
    'roster',
    'The project could not be deleted. Please try again.',
  )
}
