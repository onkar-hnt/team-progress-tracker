import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type { CreateMentorRequest, Mentor, UpdateMentorRequest } from '@models/index'
import { provisionMentorLogin } from '@services/provisioning/provision-mentor'
import type {
  ProvisionMentorInput,
  ProvisionMentorResult,
} from '@services/provisioning/provision-mentor'
import { getWorkTrackerService } from '@services/work-tracker.service'

import { queryKeys } from '../query-keys'
import { ROSTER_STALE_TIME, useScopedQuery, useWorkTrackerMutation } from './scoped-query'
import type { UpdateVariables } from './scoped-query'

export function useMentors(): UseQueryResult<Mentor[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.mentors(), scopeId],
    (scope) => service.getMentors(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useRosterMentors(): UseQueryResult<Mentor[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.roster('mentors'), scopeId],
    (scope) => service.getRosterMentors(scope),
    { staleTime: ROSTER_STALE_TIME },
  )
}

export function useCreateMentor(): UseMutationResult<Mentor, Error, CreateMentorRequest> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (request: CreateMentorRequest) => service.createMentor(request),
    'roster',
    'The mentor could not be created. Please try again.',
  )
}

export function useUpdateMentor(): UseMutationResult<
  Mentor,
  Error,
  UpdateVariables<UpdateMentorRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ changes, id }: UpdateVariables<UpdateMentorRequest>) => service.updateMentor(id, changes),
    'roster',
    'The mentor could not be saved. Please try again.',
  )
}

export function useDeleteMentor(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.deleteMentor(id),
    'roster',
    'The mentor could not be deleted. Please try again.',
  )
}

export function useProvisionMentorLogin(): UseMutationResult<
  ProvisionMentorResult,
  Error,
  ProvisionMentorInput
> {
  return useWorkTrackerMutation(
    (input: ProvisionMentorInput) => provisionMentorLogin(input),
    'roster',
    null,
  )
}

export interface SetMentorAssignmentsVariables {
  mentorId: string
  developerIds: readonly string[]
}

export function useSetMentorAssignments(): UseMutationResult<
  unknown,
  Error,
  SetMentorAssignmentsVariables
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ developerIds, mentorId }: SetMentorAssignmentsVariables) =>
      service.setMentorAssignments(mentorId, developerIds),
    'roster',
    'The assigned developers could not be saved. Please try again.',
  )
}
