/**
 * A statement addressed to one person about something that happened to their
 * work.
 *
 * Named `AppNotification` rather than `Notification` because the DOM already
 * owns that name globally, and a shadowed built-in is the kind of thing that
 * type-checks in one file and surprises somebody in another.
 *
 * The title and message arrive already worded. They are composed in the
 * database, by the triggers in `20260913120000_notifications.sql`, because the
 * wording draws on rows the recipient may not be permitted to read — a mentor's
 * name, or the status a task moved away from.
 */

/**
 * The events the application notifies on.
 *
 * Mirrors the `type` check constraint on `public.notifications`. Widening one
 * without the other means either rows the interface cannot render or a type the
 * database rejects, so the two are changed together — and `describeNotification`
 * is exhaustive over this union so the compiler says which file was forgotten.
 */
export const NOTIFICATION_TYPES = [
  'daily_update_submitted',
  'feedback_added',
  'task_assigned',
  'task_reassigned',
  'task_status_changed',
  'work_blocked',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** What a notification points at, for navigation. */
export type NotificationEntityType = 'daily_update' | 'feedback' | 'task'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string

  /**
   * Absent as a pair, not individually: a notification either points at
   * something or it does not.
   */
  entityType?: NotificationEntityType
  entityId?: string

  isRead: boolean

  /** Full ISO 8601 timestamp. */
  createdAt: string
}
