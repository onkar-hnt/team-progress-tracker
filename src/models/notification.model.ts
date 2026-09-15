/** Named AppNotification to avoid clashing with the DOM Notification type. */

/** Must match the notifications.type check constraint in the database. */
export const NOTIFICATION_TYPES = [
  'daily_update_submitted',
  'feedback_added',
  'task_assigned',
  'task_comment_added',
  'task_reassigned',
  'task_status_changed',
  'work_blocked',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type NotificationEntityType = 'daily_update' | 'feedback' | 'task'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string

  entityType?: NotificationEntityType
  entityId?: string

  isRead: boolean

  createdAt: string
}
