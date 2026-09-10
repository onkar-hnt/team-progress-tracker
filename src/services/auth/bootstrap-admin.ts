import type { AppUser } from '@models/user.model'

/**
 * The one account that exists in code rather than in the workbook.
 *
 * Everything else — developers, mentors, projects, tasks, comments, mappings
 * — is workbook data. This account is deliberately the exception, because
 * there is a bootstrapping problem otherwise: sign-in reads its accounts from
 * the workbook, so an empty workbook would lock everybody out with no way to
 * add the first record. This administrator is who creates that first record.
 *
 * It is recognised before the workbook is consulted, which also means it
 * still works when the workbook is unreachable, malformed or empty.
 *
 * SECURITY: the password is in the JavaScript bundle and therefore public to
 * anyone who can load the application. Set `VITE_ADMIN_EMAIL` and
 * `VITE_ADMIN_PASSWORD` for any deployment that is reachable beyond the team,
 * and prefer the Entra sign-in path once the app registration exists.
 *
 * TODO(admin-auth): these built-in credentials are development-only and must
 * be removed once real authentication is in place. Replace them with Microsoft
 * Entra sign-in — `EntraAuthProvider` already implements it and takes over
 * automatically as soon as `VITE_ENTRA_CLIENT_ID` and `VITE_ENTRA_TENANT_ID`
 * are configured — or with a backend that verifies credentials server-side.
 * Nothing outside this module knows the email or the password, so that
 * substitution does not reach into any component.
 */

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

const DEFAULT_EMAIL = 'admin@handt.ai'
const DEFAULT_NAME = 'System Administrator'
const DEFAULT_PASSWORD = 'Admin@1234'

/**
 * Treats a blank variable as absent.
 *
 * A declared-but-empty key is what a copied `.env.example` looks like, and
 * taking it literally would set the password to the empty string and lock
 * everybody out of the one account that cannot be locked out.
 */
function configured(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

export const bootstrapAdmin = {
  email: configured(env.VITE_ADMIN_EMAIL, DEFAULT_EMAIL).toLowerCase(),
  name: configured(env.VITE_ADMIN_NAME, DEFAULT_NAME),
  password: configured(env.VITE_ADMIN_PASSWORD, DEFAULT_PASSWORD),

  /** True while the built-in password is still in use. Surfaced in the UI. */
  isUsingDefaultPassword: configured(env.VITE_ADMIN_PASSWORD, DEFAULT_PASSWORD) === DEFAULT_PASSWORD,
} as const

export function isBootstrapAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === bootstrapAdmin.email
}

/**
 * The signed-in identity for the bootstrap administrator.
 *
 * Carries no `developerId` or `mentorId`: this account owns no work and
 * mentors nobody, it only administers. Any real person who also does those
 * things should be given a workbook row of their own.
 */
export function bootstrapAdminUser(): AppUser {
  return { email: bootstrapAdmin.email, name: bootstrapAdmin.name, role: 'admin' }
}
