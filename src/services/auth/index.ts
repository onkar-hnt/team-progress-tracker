import { appConfig } from '@config/app.config'
import { getDataProvider } from '@services/data-provider/index'
import { isSupabaseConfigured } from '@services/supabase/index'

import type { AuthProvider } from './auth-provider.interface'
import { EntraAuthProvider } from './entra-auth-provider'
import { isEntraConfigured } from './entra/entra-config'
import { LocalAuthProvider } from './local-auth-provider'
import { SupabaseAuthProvider } from './supabase-auth-provider'

export type { AuthProvider } from './auth-provider.interface'
export * from './auth.errors'
export * from './permissions'
export * from './access-scope'

/** The identity sources the application can be configured to use. */
export const AUTH_MODES = ['entra', 'local', 'supabase'] as const

export type AuthMode = (typeof AUTH_MODES)[number]

export function resolveAuthMode(): AuthMode {
  const configured = appConfig.authMode

  if (AUTH_MODES.includes(configured as AuthMode)) return configured as AuthMode

  if (isSupabaseConfigured()) return 'supabase'
  if (isEntraConfigured()) return 'entra'

  return 'local'
}

export function createAuthProvider(): AuthProvider {
  switch (resolveAuthMode()) {
    case 'supabase':
      return new SupabaseAuthProvider()

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
