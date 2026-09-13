import { invokePrivilegedFunction } from './provision-login'

/**
 * Asks the server to set somebody else's password.
 *
 * Beside the provisioning modules because it is the same kind of operation: a
 * privileged account change that cannot happen in a browser, reached through an
 * Edge Function holding the service-role key, with the caller's own session
 * travelling on the request so the server can establish who they are. There is no
 * Supabase Admin API use anywhere in the bundle, here or there.
 *
 * This module is the call and nothing else. It decides nothing about who may do
 * it: that is `public.may_reset_password`, which the function asks before it acts.
 * A screen hiding a button it should not offer is a courtesy; the refusal is in
 * the database.
 *
 * The password travels in the body over TLS and is not stored, logged or returned
 * here or anywhere downstream. Nothing in this application ever reads a password
 * back — there is no endpoint that could.
 */

/** Which record names the person, mirroring the function's own vocabulary. */
export type ResetPasswordTarget = 'developer' | 'mentor'

export interface ResetPasswordInput {
  target: ResetPasswordTarget

  /** The `developers.id` or `mentors.id` of the person, never a profile id. */
  rowId: string

  password: string
}

export interface ResetPasswordResult {
  /** Echoed by the server from the record it actually changed. */
  name: string

  /**
   * Whether the account will be held on the change-password screen next time.
   *
   * True in the ordinary case: whoever set this password knows it, so the holder
   * has to replace it. False only where setting the password succeeded and
   * re-arming that requirement did not, which is a partial success the screen
   * reports differently — see `warning`.
   */
  mustChangePassword: boolean

  /** Present only on that partial success, already worded for the reader. */
  warning?: string
}

function isResetResult(value: unknown): value is ResetPasswordResult {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.name === 'string' && typeof candidate.mustChangePassword === 'boolean'
  )
}

export async function resetUserPassword({
  password,
  rowId,
  target,
}: ResetPasswordInput): Promise<ResetPasswordResult> {
  return invokePrivilegedFunction({
    functionName: 'reset-user-password',
    // The table name rather than the noun, because it is what the function
    // validates against its two allowed values before reading anything.
    body: { table: target === 'developer' ? 'developers' : 'mentors', rowId, password },
    nothingHappened: 'no password was changed',
    isExpected: isResetResult,
  })
}
