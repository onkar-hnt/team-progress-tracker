import type { AssignedTaskQuery, DailyWorkQuery, MentorCommentQuery } from '@models/index'
import type { DateRange } from '@utils/date.utils'

/**
 * Central query-key definitions.
 *
 * Keys are declared once so that invalidating after a save cannot miss a
 * screen because two files spelled a key differently. Every key starts with
 * `work-tracker`, which makes it possible to invalidate all server state in
 * one call.
 *
 * Keys that vary by access scope include the scope's identity. Without that,
 * two people sharing a browser profile could read each other's cached results
 * from the same key.
 */
const ROOT = 'work-tracker' as const

export const queryKeys = {
  root: [ROOT] as const,

  developers: () => [ROOT, 'developers'] as const,

  mentors: () => [ROOT, 'mentors'] as const,

  mentorAssignments: () => [ROOT, 'mentor-assignments'] as const,

  projects: () => [ROOT, 'projects'] as const,

  /**
   * The unnarrowed roster, read by the management screens.
   *
   * Keyed apart from the scoped lists above rather than sharing them. The two
   * return different rows for the same mentor, so one key would serve whichever
   * screen asked first.
   */
  roster: (table: 'developers' | 'mentors' | 'projects') => [ROOT, 'roster', table] as const,

  /** `null` rather than `undefined` so the key serialises consistently. */
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

  /**
   * The signed-in person's own notifications.
   *
   * Scoped like the lists above, and for the same reason: the rows belong to one
   * account, and two people sharing a browser profile must not read each other's
   * from a shared key. The database would not have served them the rows, but the
   * cache sits in front of the database.
   */
  notifications: (scopeId: string) => [ROOT, 'notifications', scopeId] as const,

  /**
   * Counted separately from the list because the list is capped — see
   * `NOTIFICATION_PAGE_SIZE`. Nested under the list's key so one invalidation
   * refreshes the panel and the badge together.
   */
  unreadNotificationCount: (scopeId: string) =>
    [ROOT, 'notifications', scopeId, 'unread-count'] as const,

  /**
   * Prefixes, for invalidating a whole family after a write.
   *
   * The keys above all carry a scope and often a filter, and a write has no
   * idea which combinations happen to be mounted. These name the family
   * instead and rely on React Query matching keys by prefix, which is also
   * what makes `dailyWorkEntry` fall under `allDailyWork` without being
   * listed twice.
   */
  allComments: () => [ROOT, 'comments'] as const,
  allDailyWork: () => [ROOT, 'daily-work'] as const,
  allDayOverviews: () => [ROOT, 'day-overview'] as const,
  allNotifications: () => [ROOT, 'notifications'] as const,
  allRangeOverviews: () => [ROOT, 'range-overview'] as const,
  allTasks: () => [ROOT, 'tasks'] as const,

  /**
   * The Admin workbook itself, rather than the records in it.
   *
   * Under the same root so a write still refreshes it: creating a mentor is
   * also evidence that the workbook is reachable and correctly structured.
   */
  adminWorkbook: () => [ROOT, 'admin', 'workbook'] as const,
}
