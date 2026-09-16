import { z } from 'zod'

import { apiEndpoints } from '@config/api'
import { NOTIFICATION_TYPES } from '@models/index'
import type { AppNotification, NotificationType } from '@models/index'
import { apiGet, apiPut, apiSend } from '@services/api/api-client'
import { describeApiConfigProblem, isApiConfigured } from '@services/api/api-config'
import { DataSourceUnavailableError } from '@services/data-provider/index'

import { notificationDtoSchema, toAppNotification } from './notification.mappers'

/** Inbox and preferences live on the API; nothing here writes notifications. */

export function areNotificationsAvailable(): boolean {
  return isApiConfigured()
}

/** Page size for notification list; unread count is fetched separately. */
export const NOTIFICATION_PAGE_SIZE = 30

function requireApi(): void {
  const problem = describeApiConfigProblem()

  if (problem !== null) {
    throw new DataSourceUnavailableError(`The API is not configured. ${problem}`)
  }
}

const KNOWN_NOTIFICATION_TYPES: ReadonlySet<string> = new Set(NOTIFICATION_TYPES)

function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && KNOWN_NOTIFICATION_TYPES.has(value)
}

const preferencesDtoSchema = z.object({
  mutedNotificationTypes: z.array(z.string()),
})

export interface NotificationPage {
  notifications: AppNotification[]
  hasMore: boolean
}

/** Re-reads from newest each page; limit+1 sets hasMore because the API has no cursor. */
export async function listNotifications(
  limit: number = NOTIFICATION_PAGE_SIZE,
): Promise<NotificationPage> {
  requireApi()

  const rows = z.array(notificationDtoSchema).parse(
    await apiGet<unknown>(apiEndpoints.notifications.list, { query: { limit: limit + 1 } }),
  )

  return {
    notifications: rows.slice(0, limit).map(toAppNotification),
    hasMore: rows.length > limit,
  }
}

/** Separate exact unread count because the list is paginated. */
export async function countUnreadNotifications(): Promise<number> {
  requireApi()

  return z.number().nonnegative().parse(await apiGet<unknown>(apiEndpoints.notifications.unreadCount))
}

export async function markNotificationRead(id: string): Promise<void> {
  requireApi()

  // Answers with a message and no payload, so the envelope carries no data.
  await apiSend('POST', apiEndpoints.notifications.read(id))
}

export async function markAllNotificationsRead(): Promise<void> {
  requireApi()

  await apiSend('POST', apiEndpoints.notifications.readAll)
}

/** The server scopes preferences to the signed-in profile. */
export async function readMutedNotificationTypes(): Promise<NotificationType[]> {
  requireApi()

  const parsed = preferencesDtoSchema.parse(await apiGet<unknown>(apiEndpoints.notifications.preferences))

  return parsed.mutedNotificationTypes.filter((value): value is NotificationType =>
    isNotificationType(value),
  )
}

/** Replaces the full muted set; unknown type names are refused by the server. */
export async function saveMutedNotificationTypes(
  types: readonly NotificationType[],
): Promise<void> {
  requireApi()

  await apiPut<unknown>(apiEndpoints.notifications.preferences, {
    mutedNotificationTypes: [...types],
  })
}

/** How often the inbox is re-read while the tab is being looked at. */
const POLL_INTERVAL_MS = 45_000

/**
 * Keeps the bell current.
 *
 * The database used to push changes over a realtime channel; the API has no
 * push channel, so this asks instead — on a timer, and immediately when the
 * tab is brought back to the front, which is when somebody is about to look.
 * Nothing is asked while the tab is hidden, so a window left open overnight
 * costs nothing.
 */
export function subscribeToNotifications(onChange: () => void): () => void {
  const isHidden = (): boolean =>
    typeof document !== 'undefined' && document.visibilityState === 'hidden'

  const timer = setInterval(() => {
    if (!isHidden()) onChange()
  }, POLL_INTERVAL_MS)

  const onVisible = (): void => {
    if (!isHidden()) onChange()
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onVisible)
  }

  return () => {
    clearInterval(timer)

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible)
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onVisible)
    }
  }
}
