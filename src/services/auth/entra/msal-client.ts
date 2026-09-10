import {
  BrowserAuthError,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-browser'
import type { AccountInfo, Configuration } from '@azure/msal-browser'

import { appConfig } from '@config/app.config'

import { SignInFailedError } from '../auth.errors'
import { GRAPH_SCOPES } from './entra-config'

/**
 * Microsoft Entra sign-in and Graph token acquisition.
 *
 * One module owns the MSAL instance because MSAL keeps its own cache and must
 * be initialised exactly once per page. Everything else in the application
 * asks for a token through `acquireGraphToken` and never touches MSAL.
 *
 * This module is always imported dynamically, so the MSAL library forms its
 * own chunk and is fetched only by deployments that actually sign in with it.
 *
 * Tokens are held by MSAL in session storage and are not persisted anywhere
 * by this application.
 */

function buildConfiguration(): Configuration {
  return {
    auth: {
      clientId: appConfig.entra.clientId,
      authority: `https://login.microsoftonline.com/${appConfig.entra.tenantId}`,
      // The hash router means the app is served from one path, so redirecting
      // back to the origin always lands somewhere the router can handle.
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

/**
 * Signs in interactively via a popup.
 *
 * A popup rather than a redirect keeps the application state intact, which
 * matters because a redirect would discard any unsaved form the person was
 * filling in. Where popups are blocked, MSAL's error is translated into a
 * message that says so.
 */
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

  // Clears this application's cached tokens without a redirect to Microsoft,
  // so the person is not signed out of every other Microsoft tab they have
  // open. `logoutRedirect` would be the wrong trade here.
  await client.clearCache(account === null ? undefined : { account })
}

/**
 * A Graph access token, refreshed silently where possible.
 *
 * Falls back to a popup only when the refresh token has expired or consent is
 * needed, so day-to-day use involves no prompts.
 */
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

/**
 * Prefers `username`, which for a work account is the UPN.
 *
 * The Employees sheet is keyed by work email, so the UPN is the value that
 * will match; `name` is a display string and may be anything.
 */
function toSignInResult(account: AccountInfo): EntraSignInResult {
  return {
    email: account.username.trim().toLowerCase(),
    displayName: account.name ?? account.username,
  }
}
