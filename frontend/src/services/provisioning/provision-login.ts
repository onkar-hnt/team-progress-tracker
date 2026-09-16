import { z } from 'zod'

import { apiEndpoints } from '@config/api'
import { apiPost } from '@services/api/api-client'
import {
  ApiConflictError,
  ApiForbiddenError,
  ApiNotFoundError,
  ApiRequestError,
  ApiUnauthorizedError,
  ApiValidationError,
} from '@services/api/api.errors'
import { DataSourceUnavailableError } from '@services/data-provider/data-provider.errors'

/** What the server did, which decides what the admin screen says afterwards. */
export type ProvisionOutcome =
  /** A fresh account was created with an initial password. */
  | 'created'
  /** An account already existed for that address and was attached. */
  | 'linked-existing'
  /** They already had a login. Nothing changed. */
  | 'already-linked'

export interface ProvisionResult {
  authUserId: string
  email: string
  outcome: ProvisionOutcome

  initialPassword?: string

  note?: string
}

export class ProvisioningError extends Error {
  readonly code: string
  readonly authUserId: string | undefined

  constructor(message: string, code: string, authUserId?: string) {
    super(message)
    this.name = 'ProvisioningError'
    this.code = code
    this.authUserId = authUserId
  }
}

const provisionResponseSchema = z.object({
  profileId: z.string().uuid(),
  email: z.string().min(1),
  temporaryPassword: z.string(),
  created: z.boolean(),
})

function mapProvisionError(error: unknown): ProvisioningError {
  if (error instanceof ApiConflictError) {
    return new ProvisioningError(error.message, 'conflict')
  }

  if (error instanceof ApiForbiddenError) {
    return new ProvisioningError(error.message, 'forbidden')
  }

  if (error instanceof ApiNotFoundError) {
    return new ProvisioningError(error.message, 'not-found')
  }

  if (error instanceof ApiValidationError) {
    return new ProvisioningError(error.message, 'validation')
  }

  if (error instanceof ApiUnauthorizedError) {
    return new ProvisioningError(
      'Your session has expired, so no login was created. Sign in again and retry.',
      'no-session',
    )
  }

  if (error instanceof DataSourceUnavailableError) {
    return new ProvisioningError(error.message, 'unreachable')
  }

  if (error instanceof ApiRequestError) {
    return new ProvisioningError(error.message, 'http-error')
  }

  if (error instanceof Error) {
    return new ProvisioningError(error.message, 'unknown')
  }

  return new ProvisioningError('The request could not be completed.', 'unknown')
}

function toProvisionResult(row: z.infer<typeof provisionResponseSchema>): ProvisionResult {
  const outcome: ProvisionOutcome = row.created ? 'created' : 'linked-existing'

  return {
    authUserId: row.profileId,
    email: row.email,
    outcome,
    ...(row.created && row.temporaryPassword !== ''
      ? { initialPassword: row.temporaryPassword }
      : {}),
  }
}

export interface ProvisionLoginRequest {
  table: 'developers' | 'mentors'
  rowId: string
  email?: string
}

/** Creates or attaches a login for somebody already on the roster. */
export async function provisionLogin(request: ProvisionLoginRequest): Promise<ProvisionResult> {
  try {
    const payload = await apiPost<unknown>(apiEndpoints.accounts.provision, {
      rowId: request.rowId,
      table: request.table,
      ...(request.email === undefined ? {} : { email: request.email }),
    })

    const parsed = provisionResponseSchema.safeParse(payload)

    if (!parsed.success) {
      throw new ProvisioningError(
        'The server gave an unexpected answer, so the login state is unknown. Refresh before retrying.',
        'unexpected-response',
      )
    }

    return toProvisionResult(parsed.data)
  } catch (error) {
    if (error instanceof ProvisioningError) throw error
    throw mapProvisionError(error)
  }
}
