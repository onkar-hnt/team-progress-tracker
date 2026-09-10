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
 * SECURITY: the password is compared in the browser, so it is only ever as
 * private as the bundle it is compared in — which is to say not private at
 * all. That is why it is absent from production builds entirely; see
 * `DEVELOPMENT_PASSWORD` below. Supabase Auth is the real sign-in path now,
 * and this account is the offline fallback rather than the way in.
 */

const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

const DEFAULT_EMAIL = 'admin@handt.ai'
const DEFAULT_NAME = 'System Administrator'

/**
 * The built-in password, in development builds only.
 *
 * Vite replaces `import.meta.env` with a literal at build time, so in a
 * production bundle this whole expression folds to the empty string: the
 * password is not merely unused there, it is not in the file to be read. The
 * distinction matters because the file is served to anyone who opens the
 * site, and a default that ships is a default that is public.
 *
 * A deployment that genuinely needs this account sets `VITE_ADMIN_PASSWORD`
 * at build time, which is a deliberate act rather than an inherited default.
 */
const DEVELOPMENT_PASSWORD = import.meta.env?.DEV === true ? 'Admin@1234' : ''

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

const password = configured(env.VITE_ADMIN_PASSWORD, DEVELOPMENT_PASSWORD)

export const bootstrapAdmin = {
  email: configured(env.VITE_ADMIN_EMAIL, DEFAULT_EMAIL).toLowerCase(),
  name: configured(env.VITE_ADMIN_NAME, DEFAULT_NAME),
  password,

  /**
   * Whether this account can be signed into at all.
   *
   * False in a production build that sets no `VITE_ADMIN_PASSWORD`, where
   * there is no password to compare against. It has to be checked before the
   * comparison rather than relied on afterwards: an empty expected password
   * would otherwise match an empty submitted one, and the account that exists
   * to rescue a locked-out team would admit anybody.
   */
  isEnabled: password !== '',

  /** True while the built-in password is still in use. Surfaced in the UI. */
  isUsingDefaultPassword: password !== '' && password === DEVELOPMENT_PASSWORD,
} as const

export function isBootstrapAdminEmail(email: string): boolean {
  if (!bootstrapAdmin.isEnabled) return false
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
