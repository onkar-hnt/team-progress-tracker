import { appConfig } from '@config/app.config'

import type { SupabaseConfigProblem } from './supabase.errors'

/** The two values needed to reach a Supabase project from a browser. */
export interface SupabaseConfig {
  readonly url: string

  /** The public, browser-safe key. Never a `service_role`/secret key. */
  readonly publishableKey: string
}

/** The variable the publishable key should be set in. */
const KEY_VARIABLE = 'VITE_SUPABASE_PUBLISHABLE_KEY'

/**
 * What kind of API key we were given.
 *
 * Supabase issues two kinds, in two generations: the legacy JWTs whose `role`
 * claim is `anon` or `service_role`, and the newer `sb_publishable_…` and
 * `sb_secret_…` strings. Only the public one of each pair may appear in a
 * browser bundle, so this distinction is a security check rather than a
 * convenience.
 */
export type SupabaseKeyKind = 'publishable' | 'secret' | 'unrecognised'

/**
 * Reads the `role` claim from a Supabase JWT key.
 *
 * The signature is neither checked nor trusted: the token is being inspected
 * to catch a copy-paste mistake by the developer holding it, not to make an
 * authorisation decision. Anything unparseable yields `null`.
 */
function readJwtRole(token: string): string | null {
  const payload = token.split('.')[1]
  if (payload === undefined) return null

  try {
    const base64 = payload.replaceAll('-', '+').replaceAll('_', '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')

    const decoded: unknown = JSON.parse(atob(padded))
    if (typeof decoded !== 'object' || decoded === null) return null

    const role = (decoded as { role?: unknown }).role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

export function classifySupabaseKey(key: string): SupabaseKeyKind {
  if (key.startsWith('sb_publishable_')) return 'publishable'
  if (key.startsWith('sb_secret_')) return 'secret'

  const role = readJwtRole(key)
  if (role === 'anon') return 'publishable'
  if (role === 'service_role') return 'secret'

  return 'unrecognised'
}

function isHttpUrl(value: string): boolean {
  try {
    // `http` is allowed for the loopback address that `supabase start` serves
    // a local stack on; every hosted project is https.
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Every problem with a configuration, rather than just the first.
 *
 * Reporting them together means somebody fixing their `.env.local` sees both
 * mistakes at once instead of rediscovering the second after a restart.
 */
export function inspectSupabaseConfig(config: SupabaseConfig): SupabaseConfigProblem[] {
  const problems: SupabaseConfigProblem[] = []

  if (config.url === '') {
    problems.push({
      variable: 'VITE_SUPABASE_URL',
      message: 'Not set. Copy the Project URL from Project Settings → API in the Supabase dashboard.',
    })
  } else if (!isHttpUrl(config.url)) {
    problems.push({
      variable: 'VITE_SUPABASE_URL',
      message: `"${config.url}" is not an absolute http(s) URL. It should look like https://<project-ref>.supabase.co.`,
    })
  }

  if (config.publishableKey === '') {
    problems.push({
      variable: KEY_VARIABLE,
      message:
        'Not set. Copy the publishable key from Project Settings → API in the Supabase dashboard. ' +
        '(VITE_SUPABASE_ANON_KEY is also accepted, for deployments predating the rename.)',
    })

    return problems
  }

  const kind = classifySupabaseKey(config.publishableKey)

  if (kind === 'secret') {
    problems.push({
      variable: KEY_VARIABLE,
      message:
        'This is a service_role/secret key. It bypasses Row Level Security, and anything in a VITE_ ' +
        'variable is readable by everyone who loads the app. Use the publishable key instead, and ' +
        'rotate this one — it has been exposed to your build.',
    })
  }

  if (kind === 'unrecognised') {
    problems.push({
      variable: KEY_VARIABLE,
      message:
        'Does not look like a Supabase key. Expected a key beginning "sb_publishable_", or a legacy ' +
        'JWT with an "anon" role claim. Check for a truncated copy-paste.',
    })
  }

  return problems
}

/**
 * The configured project, with the trailing slash normalised away.
 *
 * `supabase-js` composes paths onto this URL, and a trailing slash produces
 * doubled separators that some proxies reject.
 */
export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: appConfig.supabase.url.replace(/\/+$/, ''),
    publishableKey: appConfig.supabase.publishableKey,
  }
}

/**
 * Whether a Supabase client can be built at all.
 *
 * Lets callers offer a degraded experience — an explanatory notice, or the
 * in-memory workbook — instead of catching a thrown error.
 */
export function isSupabaseConfigured(): boolean {
  return inspectSupabaseConfig(getSupabaseConfig()).length === 0
}

/** A one-line summary for the UI, or `null` when configuration is sound. */
export function describeSupabaseConfigProblem(): string | null {
  const problems = inspectSupabaseConfig(getSupabaseConfig())
  if (problems.length === 0) return null

  return problems.map((problem) => `${problem.variable}: ${problem.message}`).join(' ')
}
