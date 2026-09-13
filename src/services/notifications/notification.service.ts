import type { PostgrestError } from '@supabase/supabase-js'

import { appConfig } from '@config/app.config'
import { NOTIFICATION_TYPES } from '@models/index'
import type { AppNotification, NotificationType } from '@models/index'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

import {
  NOTIFICATION_COLUMNS,
  notificationRowSchema,
  toAppNotification,
} from './notification.mappers'

/** Supabase-only; rows come from triggers, not client INSERT. */

export function areNotificationsAvailable(): boolean {
  return appConfig.dataSource === 'supabase' && isSupabaseConfigured()
}

/** Page size for notification list; unread count is fetched separately. */
export const NOTIFICATION_PAGE_SIZE = 30

function requireClient() {
  if (!areNotificationsAvailable()) {
    throw new DataSourceUnavailableError(
      'Notifications need the Supabase data source, which is not configured.',
    )
  }

  return getSupabaseClient()
}

/** 42P01/PGRST205 means notifications migration is not applied yet. */
const MISSING_TABLE_CODES: ReadonlySet<string> = new Set(['42P01', 'PGRST205'])

const PREFERENCES_MIGRATION = '20260913150000_notification_preferences.sql'

const KNOWN_NOTIFICATION_TYPES: ReadonlySet<string> = new Set(NOTIFICATION_TYPES)

function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && KNOWN_NOTIFICATION_TYPES.has(value)
}

function mapNotificationError(
  error: PostgrestError,
  fallback: string,
  migration = '20260913120000_notifications.sql',
): DataProviderError {
  if (MISSING_TABLE_CODES.has(error.code)) {
    return new DataSourceUnavailableError(
      `Notifications are not set up in this database yet. Apply supabase/migrations/${migration}, then reload.`,
      { cause: error },
    )
  }

  return new DataProviderError(fallback, { cause: error })
}

export interface NotificationPage {
  notifications: AppNotification[]
  hasMore: boolean
}

/** Re-reads from newest each page so Realtime invalidation stays consistent; limit+1 sets hasMore. */
export async function listNotifications(
  limit: number = NOTIFICATION_PAGE_SIZE,
): Promise<NotificationPage> {
  const { data, error } = await requireClient()
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  if (error !== null) throw mapNotificationError(error, 'Your notifications could not be loaded.')

  const rows = data ?? []

  return {
    notifications: rows.slice(0, limit).map((row) => {
      const parsed = notificationRowSchema.safeParse(row)

      if (!parsed.success) {
        throw new DataProviderError(
          'A notification could not be read. The database schema may be ahead of this build.',
          { cause: parsed.error },
        )
      }

      return toAppNotification(parsed.data)
    }),
    hasMore: rows.length > limit,
  }
}

/** Separate exact unread count because the list is paginated. */
export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await requireClient()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)

  if (error !== null) {
    throw mapNotificationError(error, 'The unread notification count could not be read.')
  }

  return count ?? 0
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await requireClient()
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('is_read', false)

  if (error !== null) {
    throw mapNotificationError(error, 'That notification could not be marked as read.')
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await requireClient()
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)

  if (error !== null) {
    throw mapNotificationError(error, 'Your notifications could not be marked as read.')
  }
}

/** RLS scopes preferences to auth.uid(); unknown type values are dropped. */
export async function readMutedNotificationTypes(): Promise<NotificationType[]> {
  const { data, error } = await requireClient()
    .from('user_preferences')
    .select('muted_notification_types')
    .maybeSingle()

  if (error !== null) {
    throw mapNotificationError(
      error,
      'Your notification preferences could not be read.',
      PREFERENCES_MIGRATION,
    )
  }

  const stored: unknown = data?.muted_notification_types

  return Array.isArray(stored)
    ? stored.filter((value): value is NotificationType => isNotificationType(value))
    : []
}

/** Upserts full muted set; profile_id must match auth.uid(). */
export async function saveMutedNotificationTypes(
  types: readonly NotificationType[],
): Promise<void> {
  const client = requireClient()

  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession()

  if (sessionError !== null || session === null) {
    throw new DataSourceUnavailableError(
      'Your notification preferences could not be saved because you are no longer signed in.',
      ...(sessionError === null ? [] : [{ cause: sessionError }]),
    )
  }

  const { error } = await client
    .from('user_preferences')
    .upsert(
      { profile_id: session.user.id, muted_notification_types: [...types] },
      { onConflict: 'profile_id' },
    )

  if (error !== null) {
    throw mapNotificationError(
      error,
      'Your notification preferences could not be saved.',
      PREFERENCES_MIGRATION,
    )
  }
}

/** Realtime uses notifications_select; callback only signals invalidation. */
export function subscribeToNotifications(onChange: () => void): () => void {
  if (!areNotificationsAvailable()) return () => undefined

  const client = getSupabaseClient()

  const channel = client
    .channel('app-notifications')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
      onChange()
    })
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
