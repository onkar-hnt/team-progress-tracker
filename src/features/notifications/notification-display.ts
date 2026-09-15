import type { IconName } from '@components/ui/icons/Icon'
import type { AppNotification, NotificationType } from '@models/index'

/**
 * How each kind of notification is drawn and where it leads.
 *
 * A table rather than a chain of conditions in the panel, so that adding the
 * seventh notification type is one entry here — and so the compiler names this
 * file if somebody adds one to `NOTIFICATION_TYPES` and forgets. `Record` over
 * the union is what makes that exhaustiveness check happen.
 */

/** Whether the notification is asking for something or reporting something. */
export type NotificationTone = 'attention' | 'informational'

interface NotificationDisplay {
  icon: IconName

  /**
   * Where following the notification goes when it names no record.
   *
   * A screen, and the recipient is implied by the type, so no role check is
   * needed to choose: only the assigned developer is told about a task, and
   * only a mentor about somebody's daily update.
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
  work_blocked: { icon: 'alert', path: '/team-activity', tone: 'attention' },
}

/**
 * Where following a notification goes.
 *
 * A notification naming a task opens that task, which is where both the work
 * and the conversation about it are. Anything else falls back to the screen for
 * its type, either because the record has no page of its own or because the
 * task it named has since been deleted, in which case the task screen says so.
 */
export function notificationPath(notification: AppNotification): string {
  if (notification.entityType === 'task' && notification.entityId !== undefined) {
    return `/tasks/${notification.entityId}`
  }

  return NOTIFICATION_DISPLAY[notification.type].path
}

/**
 * What the badge shows.
 *
 * Capped so a long-neglected inbox cannot widen the bubble enough to push the
 * header controls around. The exact figure is still announced — see the bell's
 * accessible name — so the cap is presentational only.
 */
export const UNREAD_BADGE_CAP = 9

export function formatUnreadBadge(count: number): string {
  return count > UNREAD_BADGE_CAP ? `${String(UNREAD_BADGE_CAP)}+` : String(count)
}
