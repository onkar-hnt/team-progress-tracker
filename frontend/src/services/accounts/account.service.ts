import { z } from 'zod'

import { apiEndpoints } from '@config/api'
import { USER_ROLES } from '@models/user.model'
import type { UserRole } from '@models/user.model'
import { apiGet, apiPost } from '@services/api/api-client'
import { describeApiConfigProblem, isApiConfigured } from '@services/api/api-config'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'

/** Whether this deployment has logins to administer at all. */
export function areAccountsAvailable(): boolean {
  return isApiConfigured()
}

/** One login, as the Accounts screen shows it. */
export interface Account {
  /** Identity profile id, shared with the roster link on employee and mentor rows. */
  profileId: string

  email: string

  /** From the profile display name; the roster holds the name people edit. */
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

const accountDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(USER_ROLES),
  status: z.enum(['active', 'inactive']),
  mustChangePassword: z.boolean(),
  createdAt: z.string().min(1),
})

function toAccount(row: z.infer<typeof accountDtoSchema>): Account {
  return {
    profileId: row.id,
    email: row.email,
    name: row.displayName,
    role: row.role,
    isActive: row.status === 'active',
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt,
  }
}

function requireApi(): void {
  const problem = describeApiConfigProblem()

  if (problem !== null) {
    throw new DataSourceUnavailableError(`Logins need the application API, which is not configured. ${problem}`)
  }
}

export async function listAccounts(): Promise<Account[]> {
  requireApi()

  const payload = await apiGet<unknown>(apiEndpoints.accounts.list)
  const rows = z.array(accountDtoSchema).safeParse(payload)

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

const setAccountStateSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().min(1),
  state: z.enum(['active', 'inactive']),
  unchanged: z.boolean(),
  sessionsRevoked: z.boolean(),
  warning: z.string().nullable().optional(),
})

export async function setAccountState({
  isActive,
  profileId,
}: SetAccountStateInput): Promise<SetAccountStateResult> {
  requireApi()

  const payload = await apiPost<unknown>(apiEndpoints.accounts.state, {
    profileId,
    state: isActive ? 'active' : 'inactive',
  })

  const row = setAccountStateSchema.safeParse(payload)

  if (!row.success) {
    throw new DataProviderError(
      'The login was updated but the response could not be read.',
      { cause: row.error },
    )
  }

  // Reported by the server, which is the only party that knows whether it
  // wrote anything and when existing sessions stop working.
  const { name, sessionsRevoked, state, unchanged, warning } = row.data

  return {
    name,
    state,
    sessionsRevoked,
    ...(unchanged ? { unchanged: true } : {}),
    ...(warning === null || warning === undefined ? {} : { warning }),
  }
}
