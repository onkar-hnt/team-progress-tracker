import type { AssignedTaskQuery, DailyWorkQuery, MentorCommentQuery } from '@models/index'
import type { DateRange } from '@utils/date.utils'

/** Scoped keys include scope identity so shared browser profiles do not cross-cache. */
const ROOT = 'work-tracker' as const

export const queryKeys = {
  root: [ROOT] as const,

  developers: () => [ROOT, 'developers'] as const,

  mentors: () => [ROOT, 'mentors'] as const,

  mentorAssignments: () => [ROOT, 'mentor-assignments'] as const,

  responsibleProjects: () => [ROOT, 'responsible-projects'] as const,

  projects: () => [ROOT, 'projects'] as const,

  /** Roster keys are separate from scoped lists because they return different rows. */
  roster: (table: 'developers' | 'mentors' | 'projects') => [ROOT, 'roster', table] as const,

  accounts: () => [ROOT, 'accounts'] as const,

  deletedRecords: () => [ROOT, 'deleted-records'] as const,

  changeLog: (limit: number) => [ROOT, 'change-log', limit] as const,

  recordChanges: (kind: string, recordId: string) =>
    [ROOT, 'change-log', 'record', kind, recordId] as const,

  resourceUsage: () => [ROOT, 'resource-usage'] as const,

  /**
   * The filter is a string, not a nested object. A nested object can keep the
   * previous cache entry when the selection changes, so the screen keeps the
   * previous rows after a new response arrives.
   */
  dailyWork: (scopeId: string, query?: DailyWorkQuery) =>
    [ROOT, 'daily-work', scopeId, serializeDailyWorkQuery(query)] as const,

  dailyWorkEntry: (id: string) => [ROOT, 'daily-work', 'entry', id] as const,

  tasks: (scopeId: string, query?: AssignedTaskQuery) =>
    [ROOT, 'tasks', scopeId, query ?? null] as const,

  task: (scopeId: string, id: string) => [ROOT, 'tasks', 'by-id', scopeId, id] as const,

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

function listOrNull(values: readonly string[] | undefined): string[] | null {
  return values === undefined ? null : [...values].sort()
}

/** Stable text for one daily-work read. Field order is fixed so equal filters match. */
export function serializeDailyWorkQuery(query?: DailyWorkQuery): string {
  return JSON.stringify([
    query?.dateFrom ?? null,
    query?.dateTo ?? null,
    listOrNull(query?.developerIds),
    listOrNull(query?.projectIds),
    listOrNull(query?.statuses),
    listOrNull(query?.priorities),
    query?.isBlocked ?? null,
    query?.limit ?? null,
  ])
}

function readList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  return value.filter((item): item is string => typeof item === 'string')
}

/** Inverse of `serializeDailyWorkQuery`. Null slots are an open filter, not an empty one. */
export function parseDailyWorkQuery(serialized: string): DailyWorkQuery | undefined {
  let parsed: unknown

  try {
    parsed = JSON.parse(serialized)
  } catch {
    return undefined
  }

  if (!Array.isArray(parsed)) return undefined

  const [dateFrom, dateTo, developerIds, projectIds, statuses, priorities, isBlocked, limit] =
    parsed
  const query: DailyWorkQuery = {}

  if (typeof dateFrom === 'string') query.dateFrom = dateFrom
  if (typeof dateTo === 'string') query.dateTo = dateTo

  const developers = readList(developerIds)
  const projects = readList(projectIds)
  const statusList = readList(statuses)
  const priorityList = readList(priorities)

  if (developers !== undefined) query.developerIds = developers
  if (projects !== undefined) query.projectIds = projects
  if (statusList !== undefined) query.statuses = statusList as DailyWorkQuery['statuses']
  if (priorityList !== undefined) query.priorities = priorityList as DailyWorkQuery['priorities']
  if (typeof isBlocked === 'boolean') query.isBlocked = isBlocked
  if (typeof limit === 'number') query.limit = limit

  return query
}
