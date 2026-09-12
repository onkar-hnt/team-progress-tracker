import type { PostgrestError } from '@supabase/supabase-js'

import { appConfig } from '@config/app.config'
import type { AppNotification } from '@models/index'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

import {
  NOTIFICATION_COLUMNS,
  notificationRowSchema,
  toAppNotification,
} from './notification.mappers'

/**
 * Reading and clearing the signed-in person's notifications.
 *
 * ## Why this sits outside `DataProvider`
 *
 * `DataProvider` is the seam that makes the record store replaceable, and it is
 * implemented three times over — Supabase, Excel and the fixtures. Notifications
 * are not a record store: they are produced by database triggers, delivered over
 * a websocket, and secured by row-level security. A spreadsheet cannot do any of
 * those, so putting them on that interface would mean two implementations that
 * throw and a capability flag to ask before calling. This is a Supabase feature
 * and says so, through `areNotificationsAvailable`, exactly as the login
 * provisioning screens already gate on the data source.
 *
 * Everything else follows the conventions of the repositories: columns named
 * explicitly, rows validated rather than cast, failures translated into the
 * application's error taxonomy.
 *
 * ## Why there is no `create`
 *
 * Nothing in the browser may write a notification, and the database enforces
 * that rather than trusting this file: `authenticated` has no INSERT privilege
 * on the table and there is no INSERT policy. Rows come from the triggers in
 * `20260913120000_notifications.sql`, which is also what keeps the rules in one
 * place instead of at each of the five call sites that assign a task.
 */

/**
 * Whether the current deployment has notifications at all.
 *
 * The bell is hidden entirely when this is false, rather than shown empty: an
 * inbox that can never fill is worse than no inbox.
 */
export function areNotificationsAvailable(): boolean {
  return appConfig.dataSource === 'supabase' && isSupabaseConfigured()
}

/**
 * How many notifications the panel holds.
 *
 * A cap rather than paging. The unread count is asked for separately and
 * exactly, so a long history costs nothing to display correctly — and nobody
 * scrolls an inbox of this kind past the first screen.
 */
export const NOTIFICATION_PAGE_SIZE = 30

function requireClient() {
  if (!areNotificationsAvailable()) {
    throw new DataSourceUnavailableError(
      'Notifications need the Supabase data source, which is not configured.',
    )
  }

  return getSupabaseClient()
}

/**
 * The table not being there at all.
 *
 * `42P01` is Postgres saying the relation does not exist; `PGRST205` is
 * PostgREST saying it is not in the schema cache, which is the same thing seen
 * from one layer up. Either means this feature's migration has not been applied,
 * and that is worth saying outright — the generic wording sends whoever hit it
 * looking for a network fault instead.
 */
const MISSING_TABLE_CODES: ReadonlySet<string> = new Set(['42P01', 'PGRST205'])

/**
 * Translates a rejected statement.
 *
 * A local mapper rather than `mapPostgrestError`: that one is keyed by
 * `DataSourceTable`, the union naming the record tables the three data providers
 * share, and notifications are not one of those. Adding a member to it to reach
 * this would have put a notification sheet into the Excel schema's vocabulary.
 */
function mapNotificationError(error: PostgrestError, fallback: string): DataProviderError {
  if (MISSING_TABLE_CODES.has(error.code)) {
    return new DataSourceUnavailableError(
      'Notifications are not set up in this database yet. Apply ' +
        'supabase/migrations/20260913120000_notifications.sql, then reload.',
      { cause: error },
    )
  }

  return new DataProviderError(fallback, { cause: error })
}

/**
 * The most recent notifications for whoever is signed in.
 *
 * No recipient is passed, and none could be: the `notifications_select` policy
 * compares `recipient_profile_id` against `auth.uid()`, so this returns one
 * person's rows however the request is shaped. That is the whole security
 * argument, and it is the reason this takes no id — there is no parameter here
 * for a caller to tamper with.
 */
export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await requireClient()
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_PAGE_SIZE)

  if (error !== null) throw mapNotificationError(error, 'Your notifications could not be loaded.')

  return (data ?? []).map((row) => {
    const parsed = notificationRowSchema.safeParse(row)

    if (!parsed.success) {
      throw new DataProviderError(
        'A notification could not be read. The database schema may be ahead of this build.',
        { cause: parsed.error },
      )
    }

    return toAppNotification(parsed.data)
  })
}

/**
 * The unread total, counted by the database.
 *
 * Asked separately from the list rather than derived from it, because the list
 * is capped: counting the unread rows in the newest thirty would quietly
 * under-report anybody who has left more than that unread. `head: true` sends
 * no rows back — the count arrives in a header.
 */
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

/**
 * Marks one notification read.
 *
 * The id is supplied by the caller and is not trusted: the UPDATE policy's
 * `using` clause restricts the statement to the caller's own rows, so an id
 * belonging to somebody else matches nothing and changes nothing. Its
 * `with check` clause stops the row being re-addressed, and a trigger stops
 * every column except `is_read` from moving.
 */
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

/**
 * Marks everything read.
 *
 * Unbounded on purpose, and safe for the same reason as the read above: the
 * policy narrows the statement to the caller's rows before it runs. The
 * `is_read` predicate is there so the write touches only what needs changing.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await requireClient()
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false)

  if (error !== null) {
    throw mapNotificationError(error, 'Your notifications could not be marked as read.')
  }
}

/**
 * Calls back whenever the caller's notifications change, and returns the
 * unsubscribe.
 *
 * No filter on the subscription: Realtime evaluates `notifications_select` for
 * each subscriber before delivering a row, so a socket sees exactly what a query
 * would. Adding `recipient_profile_id=eq.…` would repeat that check in a place
 * where getting it wrong is invisible, and would need the profile id — which the
 * session model here does not carry.
 *
 * Deliberately says only *that* something changed. The callback re-reads through
 * the same query as everything else, so the panel cannot end up holding rows
 * that arrived by a different route and were shaped by different code.
 */
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
