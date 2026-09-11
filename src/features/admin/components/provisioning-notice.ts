import { ProvisioningError } from '@services/provisioning/provision-login'
import type { ProvisionResult } from '@services/provisioning/provision-login'

/**
 * What to say after a provisioning attempt, and how loudly.
 *
 * Shared by the Employees and Mentors screens so the two read identically.
 * They are the same operation on different records, and an administrator
 * should not have to work out whether a difference in wording means a
 * difference in what happened.
 *
 * Apart from the component that renders it, which lives next door because a
 * file exporting both a component and its helpers defeats fast refresh.
 */
export interface ProvisioningNotice {
  tone: 'success' | 'problem'
  message: string

  /**
   * The sign-in details, shown once and never fetched again.
   *
   * They exist only for as long as this notice is on screen: the password is
   * not written to the business row, the profile, storage, or the query
   * cache, and no endpoint will return it a second time. An administrator who
   * navigates away before passing it on has to reset the password from the
   * Supabase dashboard, which is the correct trade — the alternative is
   * keeping a recoverable copy of a live password.
   */
  credentials?: { email: string; password: string }
}

/**
 * Turns a successful result into what the screen says.
 *
 * Worded for both callers of each screen: this runs after creating a record
 * and after retrying on an existing row, so it may not say anybody was
 * created.
 */
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

/** The reason a provisioning attempt failed, in words an administrator can use. */
export function describeProvisionFailure(error: unknown): string {
  return error instanceof ProvisioningError || error instanceof Error
    ? error.message
    : 'The reason is unknown.'
}
