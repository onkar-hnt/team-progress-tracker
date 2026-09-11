import { invokeProvisioning } from './provision-login'
import type { ProvisionResult } from './provision-login'

/**
 * Gives a mentor a login, through the `provision-mentor-user` function.
 *
 * A different endpoint from the employee one rather than a flag, so the role
 * somebody ends up with is decided by the URL the request reached and never
 * by anything the browser put in the body.
 */

export interface ProvisionMentorInput {
  mentorId: string

  /** Used only when the mentor record carries no address of its own. */
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
