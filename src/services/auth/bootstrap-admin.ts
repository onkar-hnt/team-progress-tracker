import type { AppUser } from '@models/user.model'

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

const DEFAULT_EMAIL = 'admin@handt.ai'
const DEFAULT_NAME = 'System Administrator'

const DEVELOPMENT_PASSWORD = import.meta.env?.DEV === true ? 'Admin@1234' : ''

function configured(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

const password = configured(env.VITE_ADMIN_PASSWORD, DEVELOPMENT_PASSWORD)

export const bootstrapAdmin = {
  email: configured(env.VITE_ADMIN_EMAIL, DEFAULT_EMAIL).toLowerCase(),
  name: configured(env.VITE_ADMIN_NAME, DEFAULT_NAME),
  password,

  isEnabled: password !== '',

  /** True while the built-in password is still in use. Surfaced in the UI. */
  isUsingDefaultPassword: password !== '' && password === DEVELOPMENT_PASSWORD,
} as const

export function isBootstrapAdminEmail(email: string): boolean {
  if (!bootstrapAdmin.isEnabled) return false
  return email.trim().toLowerCase() === bootstrapAdmin.email
}

export function bootstrapAdminUser(): AppUser {
  return { email: bootstrapAdmin.email, name: bootstrapAdmin.name, role: 'admin' }
}
