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

    // For the hooks whose query carries a paging limit. Raising the limit is a new
    // key, and without this the list a person is reading would be replaced by a
    // skeleton on its way to becoming one row longer. Held to the hooks that need
    // it rather than applied to all of them, because everywhere else the screen
    // is meant to fall back to its skeleton.
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

/**
 * Roster reads, for the screens that maintain the roster.
 *
 * Deliberately separate hooks rather than a flag on the scoped ones, so a
 * screen that shows somebody's work cannot widen itself by passing an
 * argument. Anything reading these is a management screen.
 */
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

/**
 * Feedback, a page at a time when the caller asks for one.
 *
 * The one record hook that keeps its previous answer on screen while fetching,
 * because it is the one the feedback screens page through with `usePaging`. Nothing
 * about paging is decided here — the limit arrives in the query like any other
 * predicate — but the flicker it would otherwise cause is.
 */
export function useComments(query?: MentorCommentQuery): UseQueryResult<MentorCommentView[]> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => queryKeys.comments(scopeId, query),
    (scope) => service.getCommentViews(scope, query),
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

/** `null` when the developer does not exist or is outside the scope. */
export function useDeveloper(id: string): UseQueryResult<Developer | null> {
  const service = getWorkTrackerService()

  return useScopedQuery(
    (scopeId) => [...queryKeys.developers(), 'by-id', scopeId, id],
    (scope) => service.getDeveloperById(scope, id),
  )
}

/**
 * What a write touched, and so what has to be read again.
 *
 * This used to invalidate the whole root on every write, on the grounds that
 * one record feeds the dashboard, trends, developer views and reports, and
 * that narrowing would be easy to get subtly wrong. Correct, but it also threw
 * away two things that had asked not to be: the access scope, re-resolved
 * after every status change, and the Admin workbook structure, which costs a
 * handful of Graph requests and says in its own definition that it is not
 * re-read on remount.
 *
 * Three groups rather than one per table, because the couplings are real and
 * pretending otherwise is how narrowed invalidation goes wrong.
 */
type WriteScope = 'comments' | 'roster' | 'work'

const AFFECTED_BY: Readonly<Record<WriteScope, readonly (readonly unknown[])[]>> = {
  /**
   * Daily updates and tasks are one group because the database keeps their
   * statuses in step: writing either one can move the other, so neither can be
   * refetched alone. Feedback joins them because a comment names a task, and
   * renaming or deleting that task changes what the timeline reads.
   */
  work: [
    queryKeys.allDailyWork(),
    queryKeys.allTasks(),
    queryKeys.allDayOverviews(),
    queryKeys.allRangeOverviews(),
    queryKeys.allComments(),
  ],

  comments: [queryKeys.allComments()],

  /**
   * Nothing can be spared here. Every view resolves names against the roster,
   * and the access scope deciding what any of them may read is derived from it.
   */
  roster: [queryKeys.root],
}

function useInvalidateWorkTracker(scope: WriteScope): () => Promise<void> {
  const queryClient = useQueryClient()
  const service = getWorkTrackerService()

  return async () => {
    // Only a roster write can have changed what the lookup memo holds, and
    // dropping it after a status change would make the refetch below re-read
    // developers and projects to arrive at the same answer. Cleared before the
    // invalidation, so the queries it wakes resolve names against the roster
    // as it is now.
    if (scope === 'roster') service.forgetLookups()

    await Promise.all(
      AFFECTED_BY[scope].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  }
}

/**
 * Re-reads everything the signed-in person can see, on request.
 *
 * The one case where invalidating the whole root is right rather than lazy.
 * Somebody presses this precisely because they do not trust what is on screen
 * — a colleague has just changed something, or a write failed halfway — and
 * refreshing only part of it would leave them unable to say what they had
 * refreshed. Narrowed invalidation is for writes, which know what they touched.
 *
 * A mutation rather than a plain callback so the button can report that it is
 * working and refuse to be pressed twice, which matters here because the
 * refetches it triggers can take a moment on a slow connection.
 */
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

/**
 * Shared mutation wrapper, so every write refreshes the same way and reports a
 * failure the same way.
 *
 * The reporting is here rather than at the call sites because there are
 * twenty-odd of them and they were not doing it consistently. Four admin screens
 * shared a `writeState` helper that rendered the first failed mutation's message
 * as an alert above their table — which, as its own doc comment admitted, meant
 * a failed save left its explanation stranded behind the dialog that caused it.
 * The other screens showed nothing at all.
 *
 * `failureMessage` is the wording for a failure this application does not
 * recognise; anything the data layer has already phrased for a reader is used
 * instead. It is `string | null` rather than optional so that every definition
 * below has to state its intent, and the two that pass `null` say why.
 */
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
      // Logged whatever the caller has arranged, so that the SQLSTATE and
      // constraint behind a mapped message stay reachable in the console.
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
  return useWorkTrackerMutation(
    (input: ProvisionDeveloperInput) => provisionDeveloperLogin(input),
    'roster',
    // Reported by the Employees screen instead. A failure here is a partial
    // success — the employee row is already saved — and what has to be said is
    // "saved, but the login could not be set up, use Create login to retry",
    // which needs the record's name and the retry instruction. The successful
    // case shows a one-time password that has to stay on screen until it is
    // copied, so neither outcome belongs in something that fades.
    null,
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
  return useWorkTrackerMutation(
    (input: ProvisionMentorInput) => provisionMentorLogin(input),
    'roster',
    // Reported by the Mentors screen, for the reasons given above.
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
