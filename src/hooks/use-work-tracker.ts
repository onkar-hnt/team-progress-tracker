/**
 * The work-tracker hooks, grouped by the thing they read or write.
 *
 * This file is the entry point screens import from; the hooks themselves live
 * in `./work-tracker`, one module per domain, over the shared query and
 * mutation plumbing in `./work-tracker/scoped-query`.
 */

export { useRefreshWorkTracker } from './work-tracker/scoped-query'
export type { UpdateVariables } from './work-tracker/scoped-query'

export {
  useActiveDevelopers,
  useCreateDeveloper,
  useDeleteDeveloper,
  useDevelopers,
  useProvisionDeveloperLogin,
  useRosterDevelopers,
  useUpdateDeveloper,
} from './work-tracker/use-developers'

export {
  useCreateMentor,
  useDeleteMentor,
  useMentors,
  useProvisionMentorLogin,
  useRosterMentors,
  useSetMentorAssignments,
  useUpdateMentor,
} from './work-tracker/use-mentors'
export type { SetMentorAssignmentsVariables } from './work-tracker/use-mentors'

export {
  useActiveProjects,
  useActiveRosterProjects,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useRosterProjects,
  useUpdateProject,
} from './work-tracker/use-projects'

export {
  useCreateTask,
  useDeleteTask,
  useTask,
  useTasks,
  useUpdateTask,
} from './work-tracker/use-tasks'

export {
  useComments,
  useCreateComment,
  useDeleteComment,
  useTaskComments,
  useUpdateComment,
} from './work-tracker/use-comments'

export {
  useCreateDailyWorkEntry,
  useDailyWorkEntries,
  useDeleteDailyWorkEntry,
  useUpdateDailyWorkEntry,
} from './work-tracker/use-daily-work'
export type { UpdateDailyWorkEntryVariables } from './work-tracker/use-daily-work'

export { useClearLeaveDay, useLeaveDays, useMarkLeaveDay } from './work-tracker/use-leave'

export {
  useDayOverview,
  useRangeOverview,
  useUpdateCoverage,
} from './work-tracker/use-overviews'
