import type { AssignedTaskQuery, DailyWorkQuery, MentorCommentQuery } from '@models/index'
import type { DateRange } from '@utils/date.utils'

/** Scoped keys include scope identity so shared browser profiles do not cross-cache. */
const ROOT = 'work-tracker' as const

export const queryKeys = {
  root: [ROOT] as const,

  developers: () => [ROOT, 'developers'] as const,

  mentors: () => [ROOT, 'mentors'] as const,

  mentorAssignments: () => [ROOT, 'mentor-assignments'] as const,

  projects: () => [ROOT, 'projects'] as const,

  /** Roster keys are separate from scoped lists because they return different rows. */
  roster: (table: 'developers' | 'mentors' | 'projects') => [ROOT, 'roster', table] as const,

  accounts: () => [ROOT, 'accounts'] as const,

  deletedRecords: () => [ROOT, 'deleted-records'] as const,

  changeLog: (limit: number) => [ROOT, 'change-log', limit] as const,

  recordChanges: (kind: string, recordId: string) =>
    [ROOT, 'change-log', 'record', kind, recordId] as const,

  resourceUsage: () => [ROOT, 'resource-usage'] as const,

  /** null rather than undefined so the key serialises consistently. */
  dailyWork: (scopeId: string, query?: DailyWorkQuery) =>
    [ROOT, 'daily-work', scopeId, query ?? null] as const,

  dailyWorkEntry: (id: string) => [ROOT, 'daily-work', 'entry', id] as const,

  tasks: (scopeId: string, query?: AssignedTaskQuery) =>
    [ROOT, 'tasks', scopeId, query ?? null] as const,

  comments: (scopeId: string, query?: MentorCommentQuery) =>
    [ROOT, 'comments', scopeId, query ?? null] as const,

  dayOverview: (scopeId: string, isoDate: string) =>
    [ROOT, 'day-overview', scopeId, isoDate] as const,

  rangeOverview: (scopeId: string, range: DateRange) =>
    [ROOT, 'range-overview', scopeId, range.from, range.to] as const,

  /** Page size is in the key so load-more keeps previous rows via placeholderData. */
  notifications: (scopeId: string, limit: number) =>
    [ROOT, 'notifications', scopeId, 'list', limit] as const,

  /** Nested under notifications so one invalidation refreshes list and badge together. */
  unreadNotificationCount: (scopeId: string) =>
    [ROOT, 'notifications', scopeId, 'unread-count'] as const,

  /** Not nested under notifications so mark-read does not refetch preferences. */
  notificationPreferences: (scopeId: string) =>
    [ROOT, 'notification-preferences', scopeId] as const,

  /** Family prefixes for post-write invalidation via React Query partial key match. */
  allComments: () => [ROOT, 'comments'] as const,
  allDailyWork: () => [ROOT, 'daily-work'] as const,
  allDayOverviews: () => [ROOT, 'day-overview'] as const,
  allNotifications: () => [ROOT, 'notifications'] as const,
  allRangeOverviews: () => [ROOT, 'range-overview'] as const,
  allTasks: () => [ROOT, 'tasks'] as const,
}
