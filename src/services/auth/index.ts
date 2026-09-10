import type { AuthProvider } from './auth-provider.interface'
import { LocalAuthProvider } from './local-auth-provider'

export type { AuthProvider } from './auth-provider.interface'
export * from './auth.errors'
export * from './permissions'

/**
 * Builds the configured identity source.
 *
 * Only the hardcoded provider exists today. A real identity provider would be
 * added as another branch here, with no changes required in the UI.
 */
export function createAuthProvider(): AuthProvider {
  return new LocalAuthProvider()
}

let cachedProvider: AuthProvider | undefined

export function getAuthProvider(): AuthProvider {
  cachedProvider ??= createAuthProvider()
  return cachedProvider
}
