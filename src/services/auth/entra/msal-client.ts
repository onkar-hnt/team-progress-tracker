import {
  BrowserAuthError,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser'
import type { AccountInfo, Configuration } from '@azure/msal-browser'

import { appConfig } from '@config/app.config'

import { SignInFailedError } from '../auth.errors'
import { GRAPH_SCOPES } from './entra-config'

function buildConfiguration(): Configuration {
  return {
    auth: {
      clientId: appConfig.entra.clientId,
      authority: `https://login.microsoftonline.com/${appConfig.entra.tenantId}`,
      redirectUri: window.location.origin + import.meta.env.BASE_URL,
    },
    cache: {
      // Matches the app's own session policy: closing the tab signs out.
      cacheLocation: 'sessionStorage',
    },
  }
}

let clientPromise: Promise<PublicClientApplication> | undefined

/** Initialised lazily and once; MSAL requires `initialize` before any call. */
async function getClient(): Promise<PublicClientApplication> {
  clientPromise ??= (async () => {
    const client = new PublicClientApplication(buildConfiguration())
    await client.initialize()

    // Completes a redirect-based sign-in if the page was just returned to.
    await client.handleRedirectPromise()
    return client
  })()

  return clientPromise
}

function readActiveAccount(client: PublicClientApplication): AccountInfo | null {
  const active = client.getActiveAccount()
  if (active !== null) return active

  const [first] = client.getAllAccounts()
  if (first === undefined) return null

  client.setActiveAccount(first)
  return first
}

export interface EntraSignInResult {
  email: string
  displayName: string
}

export async function signInWithEntra(): Promise<EntraSignInResult> {
  const client = await getClient()

  try {
    const result = await client.loginPopup({ scopes: GRAPH_SCOPES, prompt: 'select_account' })
    client.setActiveAccount(result.account)
    return toSignInResult(result.account)
  } catch (error) {
    if (error instanceof BrowserAuthError && error.errorCode === 'popup_window_error') {
      throw new SignInFailedError(
        'The sign-in window was blocked. Allow popups for this site and try again.',
        { cause: error },
      )
    }

    throw new SignInFailedError('Microsoft sign-in did not complete.', { cause: error })
  }
}

/** The already-signed-in account, without prompting. */
export async function getEntraAccount(): Promise<EntraSignInResult | null> {
  const client = await getClient()
  const account = readActiveAccount(client)
  return account === null ? null : toSignInResult(account)
}

export async function signOutFromEntra(): Promise<void> {
  const client = await getClient()
  const account = readActiveAccount(client)

  await client.clearCache(account === null ? undefined : { account })
}

export async function acquireGraphToken(): Promise<string> {
  const client = await getClient()
  const account = readActiveAccount(client)

  if (account === null) {
    throw new SignInFailedError('No Microsoft account is signed in.')
  }

  try {
    const result = await client.acquireTokenSilent({ scopes: GRAPH_SCOPES, account })
    return result.accessToken
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      const result = await client.acquireTokenPopup({ scopes: GRAPH_SCOPES, account })
      return result.accessToken
    }

    throw new SignInFailedError('Could not obtain access to the workbook.', { cause: error })
  }
}

function toSignInResult(account: AccountInfo): EntraSignInResult {
  return {
    email: account.username.trim().toLowerCase(),
    displayName: account.name ?? account.username,
  }
}
