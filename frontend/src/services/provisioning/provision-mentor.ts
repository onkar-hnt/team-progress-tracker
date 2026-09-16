import { provisionLogin } from './provision-login'
import type { ProvisionResult } from './provision-login'

export interface ProvisionMentorInput {
  mentorId: string

  email?: string
}

export type ProvisionMentorResult = ProvisionResult & { mentorId?: string }

export async function provisionMentorLogin(
  input: ProvisionMentorInput,
): Promise<ProvisionMentorResult> {
  const result = await provisionLogin({
    table: 'mentors',
    rowId: input.mentorId,
    ...(input.email === undefined ? {} : { email: input.email }),
  })

  return { ...result, mentorId: input.mentorId }
}
