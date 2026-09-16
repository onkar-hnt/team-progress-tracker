import { z } from 'zod'

import { apiEndpoints } from '@config/api'
import { apiPost } from '@services/api/api-client'
import {
  ApiForbiddenError,
  ApiNotFoundError,
  ApiRequestError,
  ApiUnauthorizedError,
  ApiValidationError,
} from '@services/api/api.errors'
import { DataSourceUnavailableError } from '@services/data-provider/data-provider.errors'

import { ProvisioningError } from './provision-login'

/** Server-side reset; the Identity service is the authority on who may do this. */

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

function mapResetError(error: unknown): Error {
  if (error instanceof ProvisioningError) return error

  if (error instanceof ApiValidationError || error instanceof ApiForbiddenError) {
    return new ProvisioningError(error.message, 'validation')
  }

  if (error instanceof ApiNotFoundError) {
    return new ProvisioningError(error.message, 'not-found')
  }

  if (error instanceof ApiUnauthorizedError) {
    return new ProvisioningError(
      'Your session has expired, so no password was changed. Sign in again and retry.',
      'no-session',
    )
  }

  if (error instanceof DataSourceUnavailableError) return error

  if (error instanceof ApiRequestError) {
    return new ProvisioningError(error.message, 'http-error')
  }

  if (error instanceof Error) return error

  return new ProvisioningError('The password could not be changed.', 'unknown')
}

const resetResponseSchema = z.object({
  profileId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().min(1),
  mustChangePassword: z.boolean(),
})

export async function resetUserPassword({
  password,
  rowId,
  target,
}: ResetPasswordInput): Promise<ResetPasswordResult> {
  let payload: unknown

  try {
    payload = await apiPost<unknown>(apiEndpoints.accounts.resetPassword, {
      table: target === 'developer' ? 'developers' : 'mentors',
      rowId,
      password,
    })
  } catch (error) {
    throw mapResetError(error)
  }

  const parsed = resetResponseSchema.safeParse(payload)

  // The name comes back from the row the server changed, so the confirmation
  // names whoever was actually reset rather than whoever was on screen.
  if (!parsed.success) {
    throw new ProvisioningError(
      'The password was changed but the confirmation could not be read.',
      'unknown',
    )
  }

  return { name: parsed.data.name, mustChangePassword: parsed.data.mustChangePassword }
}
