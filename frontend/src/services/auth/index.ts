import { appConfig } from '@config/app.config'
import { isApiConfigured } from '@services/api/api-config'
import { getDataProvider } from '@services/data-provider/index'

import { ApiAuthProvider } from './api-auth-provider'
import type { AuthProvider } from './auth-provider.interface'
import { EntraAuthProvider } from './entra-auth-provider'
import { isEntraConfigured } from './entra/entra-config'
import { LocalAuthProvider } from './local-auth-provider'

export type { AuthProvider } from './auth-provider.interface'
export * from './auth.errors'
export * from './permissions'
export * from './access-scope'
export { changeOwnPassword } from './api-auth-provider'

/** The identity sources the application can be configured to use. */
export const AUTH_MODES = ['api', 'entra', 'local'] as const

export type AuthMode = (typeof AUTH_MODES)[number]

export function resolveAuthMode(): AuthMode {
  const configured = appConfig.authMode

  if (AUTH_MODES.includes(configured as AuthMode)) return configured as AuthMode

  if (isApiConfigured()) return 'api'
  if (isEntraConfigured()) return 'entra'

  return 'local'
}

export function createAuthProvider(): AuthProvider {
  switch (resolveAuthMode()) {
    case 'api':
      return new ApiAuthProvider()

    case 'entra':
      return new EntraAuthProvider(getDataProvider)

    case 'local':
      return new LocalAuthProvider(getDataProvider)
  }
}

let cachedProvider: AuthProvider | undefined

export function getAuthProvider(): AuthProvider {
  cachedProvider ??= createAuthProvider()
  return cachedProvider
}
