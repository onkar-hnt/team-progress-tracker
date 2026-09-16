import { provisionLogin } from './provision-login'
import type { ProvisionResult } from './provision-login'

export interface ProvisionDeveloperInput {
  developerId: string

  email?: string
}

export type ProvisionDeveloperResult = ProvisionResult & { developerId?: string }

export async function provisionDeveloperLogin(
  input: ProvisionDeveloperInput,
): Promise<ProvisionDeveloperResult> {
  const result = await provisionLogin({
    table: 'developers',
    rowId: input.developerId,
    ...(input.email === undefined ? {} : { email: input.email }),
  })

  return { ...result, developerId: input.developerId }
}
