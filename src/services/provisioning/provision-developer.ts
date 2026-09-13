import { invokeProvisioning } from './provision-login'
import type { ProvisionResult } from './provision-login'

export interface ProvisionDeveloperInput {
  developerId: string

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
