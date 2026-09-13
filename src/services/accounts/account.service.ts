import type { PostgrestError } from '@supabase/supabase-js'
import { z } from 'zod'

import { appConfig } from '@config/app.config'
import { USER_ROLES } from '@models/user.model'
import type { UserRole } from '@models/user.model'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { invokePrivilegedFunction } from '@services/provisioning/provision-login'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

/**
 * The logins themselves, as distinct from the people they belong to.
 *
 * Everywhere else in the application a person is an employee or a mentor — a
 * business row, with work and feedback hanging off it. This module is about the
 * other half: the `public.profiles` row that decides whether they can get in at
 * all, and what they see when they do.
 *
 * ## Why it is not on `DataProvider`
 *
 * Same reason as notifications. `DataProvider` is the seam that makes the record
 * store replaceable and is implemented three times over; an auth account is not a
 * record the workbook could hold, and the two offline providers have no logins to
 * list. So this is a Supabase feature and says so through `areAccountsAvailable`,
 * exactly as provisioning and password resets already do.
 *
 * ## Reading is ordinary; writing is not
 *
 * The list is a plain select. `profiles_select` already answers it correctly —
 * every row for an administrator, your own row for anybody else — so no privilege
 * is needed and none is used.
 *
 * Enabling and disabling goes out to the `set-account-state` Edge Function
 * instead, because it is two writes and only one of them is reachable from here:
 * the status column, and the ban on the auth user that stops an already-open
 * session renewing itself. See that function for why both are needed.
 */

/** Whether this deployment has logins to administer at all. */
export function areAccountsAvailable(): boolean {
  return appConfig.dataSource === 'supabase' && isSupabaseConfigured()
}

/** One login, as the Accounts screen shows it. */
export interface Account {
  /** `profiles.id`, which is also the `auth.users` id. */
  profileId: string

  email: string

  /** From `profiles.display_name`; the roster holds the name people edit. */
  name: string

  /** What they see. The authority, not `developers.access_role`. */
  role: UserRole

  /** False means every sign-in and every page load is refused. */
  isActive: boolean

  /** They are still holding a password somebody else chose for them. */
  mustChangePassword: boolean

  /** When the login was created, not the person's record. */
  createdAt: string
}

const ACCOUNT_COLUMNS = 'id, email, display_name, role, status, must_change_password, created_at'

/**
 * Validated rather than cast, like `resolveSupabaseIdentity` beside it.
 *
 * The client is not generated against the schema, so rows arrive untyped and a
 * renamed column would otherwise spread `undefined` through the table instead of
 * saying what happened.
 */
const accountRowSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  display_name: z.string().min(1),
  role: z.enum(USER_ROLES),
  status: z.enum(['active', 'inactive']),
  must_change_password: z.boolean(),
  created_at: z.string().min(1),
})

function toAccount(row: z.infer<typeof accountRowSchema>): Account {
  return {
    profileId: row.id,
    email: row.email,
    name: row.display_name,
    role: row.role,
    isActive: row.status === 'active',
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
  }
}

function requireClient() {
  if (!areAccountsAvailable()) {
    throw new DataSourceUnavailableError(
      'Logins need the Supabase data source, which is not configured.',
    )
  }

  return getSupabaseClient()
}

/**
 * A local mapper, for the same reason the notification service has one.
 *
 * `mapPostgrestError` is keyed by `DataSourceTable` — the union naming the record
 * tables all three providers share — and `profiles` is not one of those. Reaching
 * it would have meant adding a profiles sheet to the Excel schema's vocabulary.
 */
function mapAccountError(error: PostgrestError, fallback: string): DataProviderError {
  // The guard trigger and the policies both refuse with this, and the message
  // they raise is already written for a reader.
  if (error.code === '42501') {
    return new DataProviderError(error.message, { cause: error })
  }

  return new DataProviderError(fallback, { cause: error })
}

/**
 * Every login, newest activity aside.
 *
 * Ordered by name rather than by creation, because the question this screen
 * answers is "what is the state of so-and-so's account", and that is looked up by
 * name. Unbounded on purpose: this is one row per person who can sign in, so the
 * list is the size of the team.
 */
export async function listAccounts(): Promise<Account[]> {
  const client = requireClient()

  const { data, error } = await client
    .from('profiles')
    .select(ACCOUNT_COLUMNS)
    .order('display_name', { ascending: true })

  if (error !== null) throw mapAccountError(error, 'The logins could not be read.')

  const rows = z.array(accountRowSchema).safeParse(data ?? [])

  if (!rows.success) {
    throw new DataProviderError(
      'The logins are stored in an unexpected shape, so they cannot be listed.',
      { cause: rows.error },
    )
  }

  return rows.data.map(toAccount)
}

export interface SetAccountStateInput {
  profileId: string

  /** The state to end in, not a change to apply — so a repeat is harmless. */
  isActive: boolean
}

export interface SetAccountStateResult {
  /** Echoed by the server from the row it actually changed. */
  name: string

  state: 'active' | 'inactive'

  /**
   * Whether open sessions were ended as well as sign-in refused.
   *
   * False on reactivation, where there is nothing to end, and false where the ban
   * could not be applied — which is a partial success carrying a `warning`.
   */
  sessionsRevoked: boolean

  /** True when the account was already in that state and nothing was written. */
  unchanged?: boolean

  /** Present only on a partial success, already worded for the reader. */
  warning?: string
}

function isSetAccountStateResult(value: unknown): value is SetAccountStateResult {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.name === 'string' &&
    (candidate.state === 'active' || candidate.state === 'inactive') &&
    typeof candidate.sessionsRevoked === 'boolean'
  )
}

/**
 * Asks the server to enable or disable a login.
 *
 * Decides nothing about who may: that is `public.may_manage_account`, which the
 * function asks before it acts. A screen that hides the control is a courtesy; the
 * refusal is in the database.
 */
export async function setAccountState({
  isActive,
  profileId,
}: SetAccountStateInput): Promise<SetAccountStateResult> {
  return invokePrivilegedFunction({
    functionName: 'set-account-state',
    body: { profileId, state: isActive ? 'active' : 'inactive' },
    nothingHappened: 'the account was left as it was',
    isExpected: isSetAccountStateResult,
  })
}
