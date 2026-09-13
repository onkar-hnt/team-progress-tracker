import { useEffect, useRef, useState } from 'react'

import { Button } from '@components/ui/button/Button'
import {
  useNotificationRealtime,
  useNotifications,
  useUnreadNotificationCount,
} from '@hooks/use-notifications'
import { areNotificationsAvailable } from '@services/notifications/notification.service'

import { formatUnreadBadge } from '../notification-display'

import { NotificationPanel } from './NotificationPanel'

import './NotificationBell.scss'

/**
 * The bell in the header, and the popover it opens.
 *
 * Holds both queries because the badge needs the unread count whether the panel
 * is open or shut, and the panel is handed the rows rather than fetching its own
 * — one request each, and no chance of the badge and the list disagreeing.
 *
 * The first page is fetched up front rather than on first open. It is thirty rows
 * behind one index, the socket subscription is already live for the badge, and
 * the alternative is a spinner every time somebody looks. Further pages are only
 * fetched when asked for, from inside the panel.
 */
export function NotificationBell() {
  const inbox = useNotifications()
  const unreadQuery = useUnreadNotificationCount()

  // Mounted here, once. The header is the only place the bell appears, and a
  // second subscription elsewhere would double the traffic for one badge.
  useNotificationRealtime()

  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = unreadQuery.data ?? 0

  const close = (options: { restoreFocus: boolean }) => {
    setIsOpen(false)
    if (options.restoreFocus) triggerRef.current?.focus()
  }

  // `pointerdown` rather than `click`, matching `Dropdown`: pressing elsewhere
  // dismisses the popover before whatever is underneath reacts to being pressed.
  useEffect(() => {
    if (!isOpen) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target) === true) return

      setIsOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [isOpen])

  /**
   * Moves focus into the panel when it opens.
   *
   * Without this, tabbing from the bell would walk into the rest of the header
   * rather than into the list that just appeared — the panel is a later sibling
   * in the DOM but the reader's attention is on it now.
   */
  useEffect(() => {
    if (isOpen) panelRef.current?.focus()
  }, [isOpen])

  // Nothing to show, and nothing that could ever arrive: the fixtures and the
  // workbook have no triggers to write a notification. An inbox that can never
  // fill is worse than no inbox.
  if (!areNotificationsAvailable()) return null

  return (
    <div className="notification-bell" ref={containerRef}>
      <span className="notification-bell__trigger">
        <Button
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          icon="bell"
          isIconOnly
          onClick={() => {
            setIsOpen((open) => !open)
          }}
          ref={triggerRef}
          variant="inverse"
        >
          {/* The accessible name, and the only place the exact figure is
              stated: the badge itself caps at "9+". */}
          {unreadCount === 0
            ? 'Notifications'
            : `Notifications, ${String(unreadCount)} unread`}
        </Button>

        {unreadCount === 0 ? null : (
          <span aria-hidden="true" className="notification-bell__badge">
            {formatUnreadBadge(unreadCount)}
          </span>
        )}
      </span>

      {isOpen ? (
        <div
          aria-label="Notifications"
          className="notification-bell__popover"
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return

            // Stopped here so Escape dismisses the popover and not anything
            // enclosing it.
            event.preventDefault()
            event.stopPropagation()
            close({ restoreFocus: true })
          }}
          ref={panelRef}
          role="dialog"
          tabIndex={-1}
        >
          <NotificationPanel
            error={inbox.error}
            isLoadingMore={inbox.isLoadingMore}
            isPending={inbox.isPending}
            notifications={inbox.notifications}
            onDismiss={() => close({ restoreFocus: false })}
            onLoadMore={inbox.loadMore}
            onRetry={inbox.refetch}
            unreadCount={unreadCount}
          />
        </div>
      ) : null}
    </div>
  )
}
