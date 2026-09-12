import type { IconName } from '@components/ui/icons/Icon'
import type { NotificationType } from '@models/index'

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
   * Where following the notification goes.
   *
   * A screen rather than the entity itself, because the application has no
   * per-record routes — there is no `/tasks/:id`. The recipient is implied by
   * the type, so no role check is needed to choose: only the assigned developer
   * is told about a task, and only a mentor about somebody's daily update.
   */
  path: string

  tone: NotificationTone
}

export const NOTIFICATION_DISPLAY: Readonly<Record<NotificationType, NotificationDisplay>> = {
  task_assigned: { icon: 'tasks', path: '/my-tasks', tone: 'informational' },
  task_reassigned: { icon: 'tasks', path: '/my-tasks', tone: 'informational' },
  task_status_changed: { icon: 'activity', path: '/my-tasks', tone: 'informational' },
  feedback_added: { icon: 'comments', path: '/feedback', tone: 'informational' },
  daily_update_submitted: { icon: 'calendar', path: '/team-activity', tone: 'informational' },
  work_blocked: { icon: 'alert', path: '/team-activity', tone: 'attention' },
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
