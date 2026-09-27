import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type {
  AssignedTask,
  AssignedTaskQuery,
  CreateAssignedTaskRequest,
  UpdateAssignedTaskRequest,
} from '@models/index'
import { getWorkTrackerService } from '@services/work-tracker.service'
import type { AssignedTaskView } from '@services/work-tracker.views'

import { queryKeys } from '../query-keys'
import { useScopedQuery, useWorkTrackerMutation } from './scoped-query'
import type { UpdateVariables } from './scoped-query'

export function useTasks(query?: AssignedTaskQuery): UseQueryResult<AssignedTaskView[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.tasks(scopeId, query),
    (scope) => service.getTaskViews(scope, query),
  )
}

export function useTask(id: string): UseQueryResult<AssignedTaskView | null> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.task(scopeId, id),
    (scope) => service.getTaskViewById(scope, id),
  )
}

export function useCreateTask(): UseMutationResult<
  AssignedTask,
  Error,
  CreateAssignedTaskRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (request: CreateAssignedTaskRequest) => service.createTask(request),
    'work',
    'The task could not be created. Please try again.',
  )
}

export function useUpdateTask(): UseMutationResult<
  AssignedTask,
  Error,
  UpdateVariables<UpdateAssignedTaskRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ changes, id }: UpdateVariables<UpdateAssignedTaskRequest>) =>
      service.updateTask(id, changes),
    'work',
    'The task could not be saved. Please try again.',
  )
}

export function useDeleteTask(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.deleteTask(id),
    'work',
    'The task could not be deleted. Please try again.',
  )
}
