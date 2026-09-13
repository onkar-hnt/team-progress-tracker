import type { PostgrestError } from '@supabase/supabase-js'
import { z } from 'zod'

import { USER_ROLES } from '@models/user.model'
import type { UserRole } from '@models/user.model'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { invokePrivilegedFunction } from '@services/provisioning/provision-login'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

/** Whether this deployment has logins to administer at all. */
export function areAccountsAvailable(): boolean {
  return isSupabaseConfigured()
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

function mapAccountError(error: PostgrestError, fallback: string): DataProviderError {
  if (error.code === '42501') {
    return new DataProviderError(error.message, { cause: error })
  }

  return new DataProviderError(fallback, { cause: error })
}

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
