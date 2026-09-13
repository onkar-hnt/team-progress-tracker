import { useNavigate } from 'react-router-dom'

import { Button } from '@components/ui/button/Button'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Icon } from '@components/ui/icons/Icon'
import { useMarkAllNotificationsRead, useMarkNotificationRead } from '@hooks/use-notifications'
import type { AppNotification } from '@models/index'
import { formatRelativeTime, formatTimestamp } from '@utils/date.utils'

import { NOTIFICATION_DISPLAY } from '../notification-display'

import './NotificationPanel.scss'

interface NotificationPanelProps {
  notifications: readonly AppNotification[]
  unreadCount: number
  isPending: boolean
  error: Error | null
  onRetry: () => void

  /** Closes the popover once a notification has been followed. */
  onDismiss: () => void

  /** Absent when there is nothing older to fetch, which is when no button is drawn. */
  onLoadMore: (() => void) | null

  isLoadingMore: boolean
}

/**
 * The list behind the bell.
 *
 * Presentational plus two mutations, and no data fetching of its own: the bell
 * already holds the query — it needs the unread count for the badge whether the
 * panel is open or not — so passing the rows down keeps one subscription and one
 * request rather than two of each.
 */
export function NotificationPanel({
  error,
  isLoadingMore,
  isPending,
  notifications,
  onDismiss,
  onLoadMore,
  onRetry,
  unreadCount,
}: NotificationPanelProps) {
  const navigate = useNavigate()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  /**
   * Following a notification marks it read and closes the panel.
   *
   * The navigation is not made to wait on the write. Marking read is bookkeeping
   * and the reader has already asked to go somewhere; holding the transition for
   * a round trip would make the panel feel slow for no benefit, and a failed
   * write leaves the row unread, which is recoverable.
   */
  const follow = (notification: AppNotification) => {
    if (!notification.isRead) markRead.mutate(notification.id)

    onDismiss()
    void navigate(NOTIFICATION_DISPLAY[notification.type].path)
  }

  return (
    <div className="notification-panel">
      <div className="notification-panel__header">
        <h2 className="notification-panel__heading">Notifications</h2>

        {unreadCount === 0 ? null : (
          <Button
            disabled={markAllRead.isPending}
            icon="check"
            onClick={() => markAllRead.mutate()}
            size="small"
            variant="ghost"
          >
            {markAllRead.isPending ? 'Marking…' : 'Mark all read'}
          </Button>
        )}
      </div>

      <div className="notification-panel__body">
        {error !== null ? (
          <ErrorState message={error.message} onRetry={onRetry} />
        ) : isPending ? (
          <Skeleton label="Loading your notifications…" rows={3} />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon="bell"
            message="Task assignments, feedback and daily updates that need your attention will appear here."
            title="Nothing to catch up on"
          />
        ) : (
          <>
            <ul className="notification-panel__list">
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onFollow={follow}
                />
              ))}
            </ul>

            {/* At the end of the list rather than as endless scrolling. A popover
                that loads more as it is scrolled cannot be scrolled to the
                bottom, and the bottom is where somebody stops looking. */}
            {onLoadMore === null ? null : (
              <div className="notification-panel__more">
                <Button
                  disabled={isLoadingMore}
                  onClick={onLoadMore}
                  size="small"
                  variant="secondary"
                >
                  {isLoadingMore ? 'Loading…' : 'Show older'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {markAllRead.error === null ? null : (
        <p className="notification-panel__error" role="alert">
          {markAllRead.error.message}
        </p>
      )}
    </div>
  )
}

interface NotificationRowProps {
  notification: AppNotification
  onFollow: (notification: AppNotification) => void
}

/**
 * One notification, as a button.
 *
 * A real `<button>` rather than a clickable list item, so it is reachable by
 * keyboard and announced as something that can be activated. The unread dot is
 * paired with a text label of its own for the same reason the badges are: state
 * carried only by a coloured dot is state some readers do not receive.
 */
function NotificationRow({ notification, onFollow }: NotificationRowProps) {
  const display = NOTIFICATION_DISPLAY[notification.type]

  return (
    <li className="notification-panel__item">
      <button
        className={`notification-row notification-row--${display.tone}${
          notification.isRead ? '' : ' notification-row--unread'
        }`}
        onClick={() => onFollow(notification)}
        type="button"
      >
        <span aria-hidden="true" className="notification-row__icon">
          <Icon name={display.icon} size={16} />
        </span>

        <span className="notification-row__body">
          <span className="notification-row__title">
            {notification.title}
            {notification.isRead ? null : <span className="sr-only"> — unread</span>}
          </span>
          <span className="notification-row__message">{notification.message}</span>
          {/* The exact time is on the element as a tooltip, because "2 hours
              ago" is the right thing to read and the wrong thing to quote. */}
          <time className="notification-row__time" dateTime={notification.createdAt}>
            <span title={formatTimestamp(notification.createdAt)}>
              {formatRelativeTime(notification.createdAt)}
            </span>
          </time>
        </span>

        {notification.isRead ? null : <span aria-hidden="true" className="notification-row__dot" />}
      </button>
    </li>
  )
}
