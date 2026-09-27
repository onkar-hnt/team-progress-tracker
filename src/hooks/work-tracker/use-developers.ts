import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type { CreateDeveloperRequest, Developer, UpdateDeveloperRequest } from '@models/index'
import { provisionDeveloperLogin } from '@services/provisioning/provision-developer'
import type {
  ProvisionDeveloperInput,
  ProvisionDeveloperResult,
} from '@services/provisioning/provision-developer'
import { getWorkTrackerService } from '@services/work-tracker.service'

import { queryKeys } from '../query-keys'
import { ROSTER_STALE_TIME, useScopedQuery, useWorkTrackerMutation } from './scoped-query'
import type { UpdateVariables } from './scoped-query'

export function useDevelopers(): UseQueryResult<Developer[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.developers(), scopeId],
    (scope) => service.getDevelopers(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useActiveDevelopers(): UseQueryResult<Developer[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.developers(), 'active', scopeId],
    (scope) => service.getActiveDevelopers(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useRosterDevelopers(): UseQueryResult<Developer[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.roster('developers'), scopeId],
    (scope) => service.getRosterDevelopers(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useCreateDeveloper(): UseMutationResult<
  Developer,
  Error,
  CreateDeveloperRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (request: CreateDeveloperRequest) => service.createDeveloper(request),
    'roster',
    'The employee could not be created. Please try again.',
  )
}

export function useUpdateDeveloper(): UseMutationResult<
  Developer,
  Error,
  UpdateVariables<UpdateDeveloperRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ changes, id }: UpdateVariables<UpdateDeveloperRequest>) =>
      service.updateDeveloper(id, changes),
    'roster',
    'The employee could not be saved. Please try again.',
  )
}

export function useDeleteDeveloper(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.deleteDeveloper(id),
    'roster',
    'The employee could not be deleted. Please try again.',
  )
}

export function useProvisionDeveloperLogin(): UseMutationResult<
  ProvisionDeveloperResult,
  Error,
  ProvisionDeveloperInput
> {
  return useWorkTrackerMutation(
    (input: ProvisionDeveloperInput) => provisionDeveloperLogin(input),
    'roster',
    null,
  )
}
