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
 * How many notifications arrive at a time.
 *
 * It was a hard cap at first, on the argument that nobody scrolls an inbox past
 * the first screen. Mostly true, and wrong in the one case that matters: coming
 * back from a week away, the thing worth finding is the assignment from Tuesday,
 * and a cap makes it unreachable rather than merely further down. So the panel now
 * asks for another page instead, and the size is a page rather than a limit.
 *
 * The unread count is still asked for separately and exactly, so the badge is
 * right however many pages have been read.
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
 * Named separately because preferences arrived a migration later than the inbox.
 *
 * A database with notifications but not this table is an ordinary state — one
 * deploy behind — and pointing at the wrong file to apply would send whoever hit
 * it looking in a migration that is already there.
 */
const PREFERENCES_MIGRATION = '20260913150000_notification_preferences.sql'

const KNOWN_NOTIFICATION_TYPES: ReadonlySet<string> = new Set(NOTIFICATION_TYPES)

function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && KNOWN_NOTIFICATION_TYPES.has(value)
}

/**
 * Translates a rejected statement.
 *
 * A local mapper rather than `mapPostgrestError`: that one is keyed by
 * `DataSourceTable`, the union naming the record tables the three data providers
 * share, and notifications are not one of those. Adding a member to it to reach
 * this would have put a notification sheet into the Excel schema's vocabulary.
 */
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

  /** Whether asking for a larger page would return anything new. */
  hasMore: boolean
}

/**
 * The most recent notifications for whoever is signed in.
 *
 * No recipient is passed, and none could be: the `notifications_select` policy
 * compares `recipient_profile_id` against `auth.uid()`, so this returns one
 * person's rows however the request is shaped. That is the whole security
 * argument, and it is the reason this takes no id — there is no parameter here
 * for a caller to tamper with.
 *
 * ## Why a growing limit rather than a cursor
 *
 * Each page re-reads from the newest row rather than continuing after the oldest
 * one already held. That is one more row per page than a cursor would fetch, and
 * for an inbox it is the better trade: notifications arrive while the panel is
 * open, and with a cursor a row that arrived between two pages would either be
 * missed or appear in the middle of the list. Re-reading from the top means the
 * list is always one consistent answer to one query, which is also what lets
 * Realtime keep it current by simply invalidating it.
 *
 * One row more than asked for is fetched and then dropped. It is how `hasMore` is
 * known without a second count query, and it is why the button offering another
 * page never appears when there is nothing behind it.
 */
export async function listNotifications(
  limit: number = NOTIFICATION_PAGE_SIZE,
): Promise<NotificationPage> {
  const { data, error } = await requireClient()
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    // Tie-broken by id, so two notifications written by the same trigger in the
    // same statement — an assignment and its digest, say — keep a fixed order
    // between pages instead of being ordered by whatever the planner returns.
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
/**
 * The types this person has switched off.
 *
 * Takes no recipient, for the same reason the list above does not: the SELECT
 * policy compares `profile_id` against `auth.uid()`, so the table holds at most
 * one row this query can see and there is no parameter to tamper with.
 * `maybeSingle` rather than `single` because the row is written the first time
 * somebody changes something — never having opened the screen is the norm, and
 * it means everything is delivered.
 *
 * Unrecognised values are dropped rather than rejected. A build older than the
 * database would otherwise fail to render the screen over a preference it has no
 * checkbox for, which is a worse outcome than ignoring it: what it cannot show,
 * it also cannot have been asked to change.
 */
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

/**
 * Replaces the whole set.
 *
 * Sent entire rather than as one added or removed type, because the column is
 * the answer to a single question and two toggles in quick succession should not
 * depend on the order their statements arrive in. An upsert because the row may
 * not exist yet: the primary key turns the second save into an update.
 *
 * This is the one write in this file that needs the profile id — the policy
 * requires the column, and `with check` compares it to `auth.uid()`. So a
 * tampered id fails the statement rather than writing to somebody else's row.
 */
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
