import { getDataProvider } from '@services/data-provider/index'

import type { AuthProvider } from './auth-provider.interface'
import { EntraAuthProvider } from './entra-auth-provider'
import { isEntraConfigured } from './entra/msal-client'
import { LocalAuthProvider } from './local-auth-provider'

export type { AuthProvider } from './auth-provider.interface'
export * from './auth.errors'
export * from './permissions'
export * from './access-scope'

/**
 * Builds the configured identity source.
 *
 * Single sign-on is used whenever an app registration is configured, and the
 * workbook password fallback otherwise, so the application runs in both
 * states without a code change.
 *
 * The data provider is passed as a getter rather than an instance: the Excel
 * provider needs a Graph token, which comes from the same sign-in this
 * provider performs, and a lazy accessor keeps that from being a construction
 * cycle.
 */
export function createAuthProvider(): AuthProvider {
  return isEntraConfigured()
    ? new EntraAuthProvider(getDataProvider)
    : new LocalAuthProvider(getDataProvider)
}

let cachedProvider: AuthProvider | undefined

export function getAuthProvider(): AuthProvider {
  cachedProvider ??= createAuthProvider()
  return cachedProvider
}
