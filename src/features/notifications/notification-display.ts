import type { IconName } from '@components/ui/icons/Icon'
import type { AppNotification, NotificationType } from '@models/index'

/**
 * How each kind of notification is drawn and where it leads.
 *
 * A table rather than a chain of conditions in the panel, and `Record` over the
 * union, so adding a type to `NOTIFICATION_TYPES` without an entry here is a
 * compile error rather than a notification nobody can act on.
 */

/** Whether the notification is asking for something or reporting something. */
export type NotificationTone = 'attention' | 'informational'

interface NotificationDisplay {
  icon: IconName

  /**
   * Where following the notification goes when it names no record. The type
   * implies the recipient — only the assigned developer is told about a task,
   * only a mentor about somebody's daily update — so no role check is needed.
   */
  path: string

  tone: NotificationTone
}

export const NOTIFICATION_DISPLAY: Readonly<Record<NotificationType, NotificationDisplay>> = {
  task_assigned: { icon: 'tasks', path: '/my-tasks', tone: 'informational' },
  task_reassigned: { icon: 'tasks', path: '/my-tasks', tone: 'informational' },
  task_status_changed: { icon: 'activity', path: '/my-tasks', tone: 'informational' },
  task_comment_added: { icon: 'comments', path: '/my-tasks', tone: 'attention' },
  feedback_added: { icon: 'comments', path: '/feedback', tone: 'informational' },
  daily_update_submitted: { icon: 'calendar', path: '/team-activity', tone: 'informational' },
  daily_update_reminder: { icon: 'calendar', path: '/daily-update', tone: 'attention' },
  work_blocked: { icon: 'alert', path: '/team-activity', tone: 'attention' },
}

/**
 * A notification naming a task opens that task, where both the work and the
 * conversation about it are. Anything else falls back to the screen for its
 * type: the record may have no page of its own, or the task it named may since
 * have been deleted, in which case the task screen says so.
 */
export function notificationPath(notification: AppNotification): string {
  if (notification.entityType === 'task' && notification.entityId !== undefined) {
    return `/tasks/${notification.entityId}`
  }

  return NOTIFICATION_DISPLAY[notification.type].path
}

/**
 * Capped so a long-neglected inbox cannot widen the bubble enough to push the
 * header controls around. The bell's accessible name still announces the exact
 * figure, so the cap is presentational only.
 */
export const UNREAD_BADGE_CAP = 9

export function formatUnreadBadge(count: number): string {
  return count > UNREAD_BADGE_CAP ? `${String(UNREAD_BADGE_CAP)}+` : String(count)
}
