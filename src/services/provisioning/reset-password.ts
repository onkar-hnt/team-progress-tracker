import { invokePrivilegedFunction } from './provision-login'

/** Server-side reset; may_reset_password in the database is the authority. */

export type ResetPasswordTarget = 'developer' | 'mentor'

export interface ResetPasswordInput {
  target: ResetPasswordTarget

  rowId: string

  password: string
}

export interface ResetPasswordResult {
  name: string

  mustChangePassword: boolean

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
    body: { table: target === 'developer' ? 'developers' : 'mentors', rowId, password },
    nothingHappened: 'no password was changed',
    isExpected: isResetResult,
  })
}
