import type { AppUser, SignInCredentials } from '@models/user.model'
import type { DataProvider } from '@services/data-provider/data-provider.interface'

import type { AuthProvider } from './auth-provider.interface'
import { InvalidCredentialsError } from './auth.errors'
import { forgetSignedInEmail, readSignedInEmail, rememberSignedInEmail } from './session-store'
import { resolveWorkbookIdentity } from './workbook-identity'

/**
 * Fallback sign-in for deployments without single sign-on.
 *
 * Accounts come from the workbook, not from code, and the password follows the
 * agreed `FirstName@1234` convention derived from the person's name.
 *
 * SECURITY: this is a convenience gate, not protection. The rule that
 * generates the password is in the JavaScript bundle, so anyone who can open
 * the application can work out anyone else's password. It exists only so the
 * team can use the app before the Entra app registration is issued, and the
 * deployment must not be publicly reachable while it is in use.
 */
export class LocalAuthProvider implements AuthProvider {
  readonly name = 'workbook-password'
  readonly isOffline = true
  readonly usesCredentials = true

  private readonly getProvider: () => DataProvider

  constructor(getProvider: () => DataProvider) {
    this.getProvider = getProvider
  }

  async signIn(credentials?: SignInCredentials): Promise<AppUser> {
    if (credentials === undefined) throw new InvalidCredentialsError()

    const identity = await resolveWorkbookIdentity(this.getProvider(), credentials.email)

    // One error for both causes, so the response never reveals whether an
    // address exists in the workbook.
    if (identity === null || identity.expectedPassword !== credentials.password) {
      throw new InvalidCredentialsError()
    }

    rememberSignedInEmail(identity.user.email)
    return identity.user
  }

  async signOut(): Promise<void> {
    forgetSignedInEmail()
  }

  async restoreSession(): Promise<AppUser | null> {
    const email = readSignedInEmail()
    if (email === null) return null

    // The role is re-read rather than restored, so a change in Excel takes
    // effect on the next page load instead of persisting until sign-out.
    const identity = await resolveWorkbookIdentity(this.getProvider(), email)
    if (identity === null) {
      forgetSignedInEmail()
      return null
    }

    return identity.user
  }
}
