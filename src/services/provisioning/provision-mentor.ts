import { invokeProvisioning } from './provision-login'
import type { ProvisionResult } from './provision-login'

export interface ProvisionMentorInput {
  mentorId: string

  email?: string
}

export type ProvisionMentorResult = ProvisionResult & { mentorId?: string }

export async function provisionMentorLogin(
  input: ProvisionMentorInput,
): Promise<ProvisionMentorResult> {
  return invokeProvisioning('provision-mentor-user', {
    mentorId: input.mentorId,
    ...(input.email === undefined ? {} : { email: input.email }),
  })
}
