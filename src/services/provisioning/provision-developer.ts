import { invokeProvisioning } from './provision-login'
import type { ProvisionResult } from './provision-login'

/**
 * Gives an employee a login, through the `provision-developer-user` function.
 *
 * The call, the token handling and the error translation are shared with the
 * mentor equivalent; only the endpoint and the id field differ.
 */

export interface ProvisionDeveloperInput {
  developerId: string

  /** Used only when the employee record carries no address of its own. */
  email?: string
}

export type ProvisionDeveloperResult = ProvisionResult & { developerId?: string }

export async function provisionDeveloperLogin(
  input: ProvisionDeveloperInput,
): Promise<ProvisionDeveloperResult> {
  return invokeProvisioning('provision-developer-user', {
    developerId: input.developerId,
    ...(input.email === undefined ? {} : { email: input.email }),
  })
}
