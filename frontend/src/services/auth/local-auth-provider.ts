import type { AppUser, SignInCredentials } from '@models/user.model'
import type { DataProvider } from '@services/data-provider/data-provider.interface'

import type { AuthProvider } from './auth-provider.interface'
import { InvalidCredentialsError } from './auth.errors'
import { forgetSignedInEmail, readSignedInEmail, rememberSignedInEmail } from './session-store'
import { resolveRosterIdentity } from './roster-identity'

export class LocalAuthProvider implements AuthProvider {
  readonly name = 'roster-password'
  readonly isOffline = true
  readonly usesCredentials = true

  private readonly getProvider: () => DataProvider

  constructor(getProvider: () => DataProvider) {
    this.getProvider = getProvider
  }

  async signIn(credentials?: SignInCredentials): Promise<AppUser> {
    if (credentials === undefined) throw new InvalidCredentialsError()

    const identity = await resolveRosterIdentity(this.getProvider(), credentials.email)

    // One error for both causes, so the response never reveals whether an
    // address is on the roster.
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

    const identity = await resolveRosterIdentity(this.getProvider(), email)
    if (identity === null) {
      forgetSignedInEmail()
      return null
    }

    return identity.user
  }
}
