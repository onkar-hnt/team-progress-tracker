import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import type {
  AssignedTask,
  AssignedTaskQuery,
  CreateAssignedTaskRequest,
  CreateDailyWorkEntryRequest,
  CreateDeveloperRequest,
  CreateMentorCommentRequest,
  CreateMentorRequest,
  CreateProjectRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  Developer,
  Mentor,
  MentorComment,
  MentorCommentQuery,
  Project,
  UpdateAssignedTaskRequest,
  UpdateDailyWorkEntryRequest,
  UpdateDeveloperRequest,
  UpdateMentorCommentRequest,
  UpdateMentorRequest,
  UpdateProjectRequest,
} from '@models/index'
import { describeScope } from '@services/auth/index'
import type { AccessScope } from '@services/auth/index'
import { provisionDeveloperLogin } from '@services/provisioning/provision-developer'
import type {
  ProvisionDeveloperInput,
  ProvisionDeveloperResult,
} from '@services/provisioning/provision-developer'
import { provisionMentorLogin } from '@services/provisioning/provision-mentor'
import type {
  ProvisionMentorInput,
  ProvisionMentorResult,
} from '@services/provisioning/provision-mentor'
import { getWorkTrackerService } from '@services/work-tracker.service'
import type {
  AssignedTaskView,
  DailyWorkEntryView,
  DayOverview,
  MentorCommentView,
  RangeOverview,
} from '@services/work-tracker.service'
import type { DateRange } from '@utils/date.utils'

import { queryKeys } from './query-keys'
import { useAccessScope } from './use-access-scope'

/**
 * Data hooks for feature components.
 *
 * Components use these and never reach for the service or a provider
 * directly, which is what keeps the storage backend replaceable.
 *
 * Each hook resolves the access scope itself and stays disabled until it is
 * known. That is what makes the data isolation reliable: a screen cannot
 * issue an unscoped query, because it never supplies the scope, and a query
 * cannot run before the limits it must respect exist.
 */

/** Shared plumbing: disabled until a scope exists, keyed by that scope. */
function useScopedQuery<TValue>(
  buildKey: (scopeId: string) => readonly unknown[],
  run: (scope: AccessScope) => Promise<TValue>,
  options: { staleTime?: number } = {},
): UseQueryResult<TValue> {
  const { isResolving, scope } = useAccessScope()

  return useQuery({
    queryKey: buildKey(scope === null ? 'none' : describeScope(scope)),
    queryFn: () => {
      if (scope === null) throw new Error('No access scope is available.')
      return run(scope)
    },
    enabled: !isResolving && scope !== null,
    ...(options.staleTime === undefined ? {} : { staleTime: options.staleTime }),
  })
}

export function useDevelopers(): UseQueryResult<Developer[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.developers(), scopeId],
    (scope) => service.getDevelopers(scope),
    { staleTime: 5 * 60_000 },
  )
}

export function useActiveDevelopers(): UseQueryResult<Developer[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.developers(), 'active', scopeId],
    (scope) => service.getActiveDevelopers(scope),
    { staleTime: 5 * 60_000 },
  )
}

export function useMentors(): UseQueryResult<Mentor[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.mentors(), scopeId],
    (scope) => service.getMentors(scope),
    { staleTime: 5 * 60_000 },
  )
}

export function useProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.projects(), scopeId],
    (scope) => service.getProjects(scope),
    { staleTime: 5 * 60_000 },
  )
}

export function useActiveProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.projects(), 'active', scopeId],
    (scope) => service.getActiveProjects(scope),
    { staleTime: 5 * 60_000 },
  )
}

/** Entries with developer and project names resolved, newest first. */
export function useDailyWorkEntries(
  query?: DailyWorkQuery,
): UseQueryResult<DailyWorkEntryView[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.dailyWork(scopeId, query),
    (scope) => service.getDailyWorkEntryViews(scope, query),
  )
}

export function useTasks(query?: AssignedTaskQuery): UseQueryResult<AssignedTaskView[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.tasks(scopeId, query),
    (scope) => service.getTaskViews(scope, query),
  )
}

export function useComments(query?: MentorCommentQuery): UseQueryResult<MentorCommentView[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.comments(scopeId, query),
    (scope) => service.getCommentViews(scope, query),
  )
}

export function useDayOverview(isoDate: string): UseQueryResult<DayOverview> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.dayOverview(scopeId, isoDate),
    (scope) => service.getDayOverview(scope, isoDate),
  )
}

export function useRangeOverview(range: DateRange): UseQueryResult<RangeOverview> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.rangeOverview(scopeId, range),
    (scope) => service.getRangeOverview(scope, range),
  )
}

/** `null` when the developer does not exist or is outside the scope. */
export function useDeveloper(id: string): UseQueryResult<Developer | null> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.developers(), 'by-id', scopeId, id],
    (scope) => service.getDeveloperById(scope, id),
  )
}

/**
 * Invalidates every derived view after a write.
 *
 * A single record feeds the dashboard, trends, developer views and reports, so
 * targeted invalidation would be easy to get subtly wrong. Refetching all
 * work-tracker queries is cheap for a team of this size and always correct.
 */
function useInvalidateWorkTracker(): () => Promise<void> {
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.root })
  }
}

/** Shared mutation wrapper, so every write refreshes the same way. */
function useWorkTrackerMutation<TResult, TVariables>(
  run: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, Error, TVariables> {
  const invalidate = useInvalidateWorkTracker()

  return useMutation({ mutationFn: run, onSuccess: invalidate })
}

export interface UpdateVariables<TRequest> {
  id: string
  changes: TRequest
}

export function useCreateDailyWorkEntry(): UseMutationResult<
  DailyWorkEntry,
  Error,
  CreateDailyWorkEntryRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((request: CreateDailyWorkEntryRequest) =>
    service.createDailyWorkEntry(request),
  )
}

export type UpdateDailyWorkEntryVariables = UpdateVariables<UpdateDailyWorkEntryRequest>

export function useUpdateDailyWorkEntry(): UseMutationResult<
  DailyWorkEntry,
  Error,
  UpdateDailyWorkEntryVariables
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(({ changes, id }: UpdateDailyWorkEntryVariables) =>
    service.updateDailyWorkEntry(id, changes),
  )
}

export function useDeleteDailyWorkEntry(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((id: string) => service.deleteDailyWorkEntry(id))
}

export function useCreateDeveloper(): UseMutationResult<
  Developer,
  Error,
  CreateDeveloperRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((request: CreateDeveloperRequest) =>
    service.createDeveloper(request),
  )
}

export function useUpdateDeveloper(): UseMutationResult<
  Developer,
  Error,
  UpdateVariables<UpdateDeveloperRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(({ changes, id }: UpdateVariables<UpdateDeveloperRequest>) =>
    service.updateDeveloper(id, changes),
  )
}

export function useDeleteDeveloper(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((id: string) => service.deleteDeveloper(id))
}

/**
 * Gives an employee a login, through the server-side provisioning function.
 *
 * Not a `WorkTrackerService` call — provisioning is an auth concern, not a
 * record one — but it shares the same invalidation, because a successful
 * attempt sets `profile_id` and the employee list shows that column.
 */
export function useProvisionDeveloperLogin(): UseMutationResult<
  ProvisionDeveloperResult,
  Error,
  ProvisionDeveloperInput
> {
  return useWorkTrackerMutation((input: ProvisionDeveloperInput) =>
    provisionDeveloperLogin(input),
  )
}

/**
 * Gives a mentor a login. The employee equivalent, against the mentor table.
 *
 * Shares the same invalidation for the same reason: a successful attempt sets
 * `profile_id`, and the mentor list shows that column.
 */
export function useProvisionMentorLogin(): UseMutationResult<
  ProvisionMentorResult,
  Error,
  ProvisionMentorInput
> {
  return useWorkTrackerMutation((input: ProvisionMentorInput) => provisionMentorLogin(input))
}

export function useCreateMentor(): UseMutationResult<Mentor, Error, CreateMentorRequest> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((request: CreateMentorRequest) => service.createMentor(request))
}

export function useUpdateMentor(): UseMutationResult<
  Mentor,
  Error,
  UpdateVariables<UpdateMentorRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(({ changes, id }: UpdateVariables<UpdateMentorRequest>) =>
    service.updateMentor(id, changes),
  )
}

export function useDeleteMentor(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((id: string) => service.deleteMentor(id))
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
  return useWorkTrackerMutation(({ developerIds, mentorId }: SetMentorAssignmentsVariables) =>
    service.setMentorAssignments(mentorId, developerIds),
  )
}

export function useCreateProject(): UseMutationResult<Project, Error, CreateProjectRequest> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((request: CreateProjectRequest) => service.createProject(request))
}

export function useUpdateProject(): UseMutationResult<
  Project,
  Error,
  UpdateVariables<UpdateProjectRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(({ changes, id }: UpdateVariables<UpdateProjectRequest>) =>
    service.updateProject(id, changes),
  )
}

export function useDeleteProject(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((id: string) => service.deleteProject(id))
}

export function useCreateTask(): UseMutationResult<
  AssignedTask,
  Error,
  CreateAssignedTaskRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((request: CreateAssignedTaskRequest) =>
    service.createTask(request),
  )
}

export function useUpdateTask(): UseMutationResult<
  AssignedTask,
  Error,
  UpdateVariables<UpdateAssignedTaskRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(({ changes, id }: UpdateVariables<UpdateAssignedTaskRequest>) =>
    service.updateTask(id, changes),
  )
}

export function useDeleteTask(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((id: string) => service.deleteTask(id))
}

export function useCreateComment(): UseMutationResult<
  MentorComment,
  Error,
  CreateMentorCommentRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((request: CreateMentorCommentRequest) =>
    service.createComment(request),
  )
}

export function useUpdateComment(): UseMutationResult<
  MentorComment,
  Error,
  UpdateVariables<UpdateMentorCommentRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(({ changes, id }: UpdateVariables<UpdateMentorCommentRequest>) =>
    service.updateComment(id, changes),
  )
}

export function useDeleteComment(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation((id: string) => service.deleteComment(id))
}
