import type { AppUser } from '@models/user.model'
import type { DataProvider } from '@services/data-provider/data-provider.interface'

import type { AuthProvider } from './auth-provider.interface'
import { UnknownAccountError } from './auth.errors'
import {
  getEntraAccount,
  signInWithEntra,
  signOutFromEntra,
} from './entra/msal-client'
import { forgetSignedInEmail, rememberSignedInEmail } from './session-store'
import { resolveWorkbookIdentity } from './workbook-identity'

/**
 * Single sign-on through Microsoft Entra.
 *
 * Entra answers "who is this person", and the workbook answers "what may they
 * see": the address returned by Entra is looked up in the Employees and
 * Mentors tables to resolve the role. Someone with a valid company account
 * but no workbook row is refused, so access is granted by adding a row rather
 * than by changing an app registration.
 *
 * The same sign-in also yields the Graph token the workbook is read with,
 * which is why there is no second prompt for data access.
 */
export class EntraAuthProvider implements AuthProvider {
  readonly name = 'entra-id'
  readonly isOffline = false
  readonly usesCredentials = false

  private readonly getProvider: () => DataProvider

  constructor(getProvider: () => DataProvider) {
    this.getProvider = getProvider
  }

  async signIn(): Promise<AppUser> {
    const account = await signInWithEntra()
    return this.resolveOrReject(account.email)
  }

  async signOut(): Promise<void> {
    forgetSignedInEmail()
    await signOutFromEntra()
  }

  async restoreSession(): Promise<AppUser | null> {
    const account = await getEntraAccount()
    if (account === null) return null

    try {
      return await this.resolveOrReject(account.email)
    } catch {
      // A row removed while the tab was open must not leave a broken session
      // on screen; treating it as signed out sends the person to the login
      // page, where the reason is explained if they try again.
      forgetSignedInEmail()
      return null
    }
  }

  private async resolveOrReject(email: string): Promise<AppUser> {
    const identity = await resolveWorkbookIdentity(this.getProvider(), email)
    if (identity === null) throw new UnknownAccountError(email)

    rememberSignedInEmail(identity.user.email)
    return identity.user
  }
}
