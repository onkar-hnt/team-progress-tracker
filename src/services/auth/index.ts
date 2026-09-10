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

/**
 * Which identity source to use.
 *
 * `VITE_AUTH_MODE` pins the choice; otherwise the most capable configured
 * source wins. Supabase outranks Entra because Supabase Auth is what makes
 * the database enforce access, and Entra only ever secured the workbook.
 *
 * `local` is last and reachable by configuration alone. That ordering is the
 * point: the built-in administrator credentials must never be something the
 * application falls back to because something else failed, only something an
 * operator asked for.
 */
export function resolveAuthMode(): AuthMode {
  const configured = appConfig.authMode

  if (AUTH_MODES.includes(configured as AuthMode)) return configured as AuthMode

  if (isSupabaseConfigured()) return 'supabase'
  if (isEntraConfigured()) return 'entra'

  return 'local'
}

/**
 * Builds the configured identity source.
 *
 * The data provider is passed as a getter rather than an instance: the Excel
 * provider needs a Graph token, which comes from the same sign-in the Entra
 * provider performs, and a lazy accessor keeps that from being a construction
 * cycle. `SupabaseAuthProvider` needs none of it — it reads identity from the
 * database directly, so it stays independent of whichever data source the
 * rest of the application is using.
 */
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
