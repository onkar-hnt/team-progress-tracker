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

  /**
   * The logins, for the Accounts screen.
   *
   * Unscoped, unlike the lists below. Row-level security already answers this one
   * differently by role — every row for an administrator, your own for anybody
   * else — and only an administrator ever asks it, so there is nothing a scope
   * identity would keep apart.
   */
  accounts: () => [ROOT, 'accounts'] as const,

  /**
   * What has been deleted, for the Recently deleted screen.
   *
   * Unscoped for the same reason as the accounts above: three select policies
   * already answer it differently per person, and there is no id in the request
   * for a scope identity to keep apart.
   */
  deletedRecords: () => [ROOT, 'deleted-records'] as const,

  /**
   * The change log, whole or for one record.
   *
   * Unscoped, like the two above: `record_history_select` answers it per person and
   * the request carries nothing for a scope identity to keep apart. The limit is in
   * the key because raising it is a different question with a different answer.
   */
  changeLog: (limit: number) => [ROOT, 'change-log', limit] as const,

  recordChanges: (kind: string, recordId: string) =>
    [ROOT, 'change-log', 'record', kind, recordId] as const,

  /**
   * What the Supabase project is using of its plan.
   *
   * One key for the whole answer, because it arrives as one measurement: sizes taken a
   * second apart would not disagree usefully, and splitting them would only mean two
   * scans of the same tables. Unscoped, like the keys above — only an administrator
   * asks, and the answer is the project's rather than anybody's.
   */
  resourceUsage: () => [ROOT, 'resource-usage'] as const,

  /**
   * The files on one record.
   *
   * Keyed by the record and not by the screen, so the same list serves wherever that
   * record is open. Not under the record's own key, because a file is not part of the
   * record's answer and a write to one should not invalidate the other.
   */
  attachments: (owner: string, recordId: string) =>
    [ROOT, 'attachments', owner, recordId] as const,

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
  /**
   * The page size is part of the key rather than state beside it, so asking for
   * another page is a new query rather than a refetch of the old one — which is
   * what keeps the previous page on screen while the larger one loads.
   */
  notifications: (scopeId: string, limit: number) =>
    [ROOT, 'notifications', scopeId, 'list', limit] as const,

  /**
   * Counted separately from the list because the list is capped — see
   * `NOTIFICATION_PAGE_SIZE`. Nested under the list's key so one invalidation
   * refreshes the panel and the badge together.
   */
  unreadNotificationCount: (scopeId: string) =>
    [ROOT, 'notifications', scopeId, 'unread-count'] as const,

  /**
   * Which notification types the signed-in person has switched off.
   *
   * Deliberately *not* nested under `notifications`, unlike the count above.
   * Marking a notification read invalidates that whole family, and it happens on
   * every click in the panel — refetching a preference nobody changed each time
   * would be a request per click. Preferences change from one screen, and that
   * screen invalidates this key itself.
   */
  notificationPreferences: (scopeId: string) =>
    [ROOT, 'notification-preferences', scopeId] as const,

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
}
