import { useMemo } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useSnackbar } from '@app/providers/snackbar-context'
import { describeScope } from '@services/auth/index'
import type { AccessScope } from '@services/auth/index'
import { logFailure, toUserMessage } from '@services/errors/error-message'
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

function useScopedQuery<TValue>(
  buildKey: (scopeId: string) => readonly unknown[],
  run: (scope: AccessScope) => Promise<TValue>,
  options: { staleTime?: number; keepsPreviousData?: boolean } = {},
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

    ...(options.keepsPreviousData === true ? { placeholderData: keepPreviousData } : {}),
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

export function useRosterDevelopers(): UseQueryResult<Developer[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.roster('developers'), scopeId],
    (scope) => service.getRosterDevelopers(scope),
    { staleTime: 5 * 60_000 },
  )
}

export function useRosterMentors(): UseQueryResult<Mentor[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.roster('mentors'), scopeId],
    (scope) => service.getRosterMentors(scope),
    { staleTime: 5 * 60_000 },
  )
}

export function useRosterProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.roster('projects'), scopeId],
    (scope) => service.getRosterProjects(scope),
    { staleTime: 5 * 60_000 },
  )
}

export function useActiveRosterProjects(): UseQueryResult<Project[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.roster('projects'), 'active', scopeId],
    (scope) => service.getActiveRosterProjects(scope),
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

export function useTask(id: string): UseQueryResult<AssignedTaskView | null> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.task(scopeId, id),
    (scope) => service.getTaskViewById(scope, id),
  )
}

export function useComments(query?: MentorCommentQuery): UseQueryResult<MentorCommentView[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.comments(scopeId, query),
    (scope) => service.getCommentViews(scope, query),
    { keepsPreviousData: true },
  )
}

/** The trail for one task, oldest first, which is the order a conversation reads in. */
export function useTaskComments(taskId: string): UseQueryResult<MentorCommentView[]> {
  const service = getWorkTrackerService()
  const query = useMemo(() => ({ taskIds: [taskId] }), [taskId])

  return useScopedQuery(
    (scopeId) => queryKeys.comments(scopeId, query),
    async (scope) => {
      const comments = await service.getCommentViews(scope, query)
      return [...comments].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    },
    { keepsPreviousData: true },
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

export function useDeveloper(id: string): UseQueryResult<Developer | null> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.developers(), 'by-id', scopeId, id],
    (scope) => service.getDeveloperById(scope, id),
  )
}

type WriteScope = 'comments' | 'roster' | 'work'

const AFFECTED_BY: Readonly<Record<WriteScope, readonly (readonly unknown[])[]>> = {
  work: [
    queryKeys.allDailyWork(),
    queryKeys.allTasks(),
    queryKeys.allDayOverviews(),
    queryKeys.allRangeOverviews(),
    queryKeys.allComments(),
  ],

  comments: [queryKeys.allComments()],

  roster: [queryKeys.root],
}

function useInvalidateWorkTracker(scope: WriteScope): () => Promise<void> {
  const queryClient = useQueryClient()
  const service = getWorkTrackerService()

  return async () => {
    if (scope === 'roster') service.forgetLookups()

    await Promise.all(
      AFFECTED_BY[scope].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  }
}

export function useRefreshWorkTracker(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient()
  const service = getWorkTrackerService()

  return useMutation({
    mutationFn: async () => {
      service.forgetLookups()
      await queryClient.invalidateQueries({ queryKey: queryKeys.root })
    },
  })
}

function useWorkTrackerMutation<TResult, TVariables>(
  run: (variables: TVariables) => Promise<TResult>,
  scope: WriteScope,
  failureMessage: string | null,
): UseMutationResult<TResult, Error, TVariables> {
  const invalidate = useInvalidateWorkTracker(scope)
  const snackbar = useSnackbar()

  return useMutation({
    mutationFn: run,
    onSuccess: invalidate,
    onError: (error) => {
      logFailure(`write:${scope}`, error)

      if (failureMessage !== null) snackbar.error(toUserMessage(error, failureMessage))
    },
  })
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
  return useWorkTrackerMutation(
    (request: CreateDailyWorkEntryRequest) => service.createDailyWorkEntry(request),
    'work',
    'The daily update could not be submitted. Please try again.',
  )
}

export type UpdateDailyWorkEntryVariables = UpdateVariables<UpdateDailyWorkEntryRequest>

export function useUpdateDailyWorkEntry(): UseMutationResult<
  DailyWorkEntry,
  Error,
  UpdateDailyWorkEntryVariables
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ changes, id }: UpdateDailyWorkEntryVariables) => service.updateDailyWorkEntry(id, changes),
    'work',
    'The daily update could not be saved. Please try again.',
  )
}

export function useDeleteDailyWorkEntry(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.deleteDailyWorkEntry(id),
    'work',
    'The daily update could not be deleted. Please try again.',
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

export function useCreateComment(): UseMutationResult<
  MentorComment,
  Error,
  CreateMentorCommentRequest
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (request: CreateMentorCommentRequest) => service.createComment(request),
    'comments',
    'The feedback could not be saved. Please try again.',
  )
}

export function useUpdateComment(): UseMutationResult<
  MentorComment,
  Error,
  UpdateVariables<UpdateMentorCommentRequest>
> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    ({ changes, id }: UpdateVariables<UpdateMentorCommentRequest>) =>
      service.updateComment(id, changes),
    'comments',
    'The feedback could not be saved. Please try again.',
  )
}

export function useDeleteComment(): UseMutationResult<void, Error, string> {
  const service = getWorkTrackerService()
  return useWorkTrackerMutation(
    (id: string) => service.deleteComment(id),
    'comments',
    'The feedback could not be deleted. Please try again.',
  )
}
