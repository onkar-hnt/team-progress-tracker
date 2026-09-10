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
 */

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

const DEFAULT_EMAIL = 'admin@localhost'
const DEFAULT_NAME = 'System Administrator'
const DEFAULT_PASSWORD = 'Admin@1234'

export const bootstrapAdmin = {
  email: (env.VITE_ADMIN_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase(),
  name: env.VITE_ADMIN_NAME ?? DEFAULT_NAME,
  password: env.VITE_ADMIN_PASSWORD ?? DEFAULT_PASSWORD,

  /** True while the built-in password is still in use. Surfaced in the UI. */
  isUsingDefaultPassword: (env.VITE_ADMIN_PASSWORD ?? '') === '',
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
