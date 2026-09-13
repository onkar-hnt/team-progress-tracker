import { ProvisioningError } from '@services/provisioning/provision-login'
import type { ProvisionResult } from '@services/provisioning/provision-login'

export interface ProvisioningNotice {
  tone: 'success' | 'problem'
  message: string
  // Shown once; no endpoint returns the initial password again.
  credentials?: { email: string; password: string }
}

export function describeProvisionOutcome(
  result: ProvisionResult,
  name: string,
): Pick<ProvisioningNotice, 'credentials' | 'message'> {
  const note = result.note === undefined ? '' : ` ${result.note}`

  if (result.outcome === 'created') {
    return {
      message: `Login access created successfully for ${name}.${note}`,
      ...(result.initialPassword === undefined
        ? {}
        : { credentials: { email: result.email, password: result.initialPassword } }),
    }
  }

  if (result.outcome === 'linked-existing') {
    return {
      message: `${name} was attached to the existing account for ${result.email}. They can sign in with the password they already have.${note}`,
    }
  }

  return { message: `${name} already had a login, so nothing was changed.${note}` }
}

export function describeProvisionFailure(error: unknown): string {
  return error instanceof ProvisioningError || error instanceof Error
    ? error.message
    : 'The reason is unknown.'
}
