import type { AppUser } from '@models/user.model'
import type { DataProvider } from '@services/data-provider/data-provider.interface'

import type { AuthProvider } from './auth-provider.interface'
import { UnknownAccountError } from './auth.errors'
import { forgetSignedInEmail, rememberSignedInEmail } from './session-store'
import { resolveWorkbookIdentity } from './workbook-identity'

const loadMsal = () => import('./entra/msal-client')

export class EntraAuthProvider implements AuthProvider {
  readonly name = 'entra-id'
  readonly isOffline = false
  readonly usesCredentials = false

  private readonly getProvider: () => DataProvider

  constructor(getProvider: () => DataProvider) {
    this.getProvider = getProvider
  }

  async signIn(): Promise<AppUser> {
    const { signInWithEntra } = await loadMsal()
    const account = await signInWithEntra()
    return this.resolveOrReject(account.email)
  }

  async signOut(): Promise<void> {
    forgetSignedInEmail()

    const { signOutFromEntra } = await loadMsal()
    await signOutFromEntra()
  }

  async restoreSession(): Promise<AppUser | null> {
    const { getEntraAccount } = await loadMsal()
    const account = await getEntraAccount()
    if (account === null) return null

    try {
      return await this.resolveOrReject(account.email)
    } catch {
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
