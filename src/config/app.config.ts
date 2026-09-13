/**
 * Vite injects `import.meta.env` at build time. Falling back to an empty
 * object keeps the module importable from plain Node, which is what allows
 * the data layer to be exercised by scripts and unit tests.
 */
const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

/** Treats a blank variable as absent, which is how an unset `.env` key reads. */
function readText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

/**
 * Resolved application configuration.
 *
 * Reading `import.meta.env` in exactly one place keeps environment handling
 * testable and stops feature code from depending on build-time details.
 */
export const appConfig = {
  /**
   * Which identity source to use, overriding automatic selection.
   *
   * Left blank normally: `createAuthProvider` picks Supabase when a project
   * is configured, Entra when an app registration is, and roster passwords
   * otherwise. Setting this pins the choice, which is how the offline
   * fallback becomes an explicit decision rather than something the
   * application can slip into on its own.
   */
  authMode: readText(env.VITE_AUTH_MODE, ''),

  /**
   * The Supabase project records are stored in.
   *
   * Both values are public. The URL identifies the project and the anon key
   * identifies the *project*, not the caller, so it is designed to ship in a
   * browser bundle. What a caller may read or write is decided by Supabase
   * Auth and Row Level Security in the database, never by keeping this key
   * hidden.
   *
   * Blank until a project exists, which is why nothing here throws.
   * Validation lives in `@services/supabase`, which refuses to build a client
   * — rather than failing later with a network error — when these are
   * missing, malformed, or a `service_role` key.
   */
  supabase: {
    url: readText(env.VITE_SUPABASE_URL, ''),

    /**
     * Supabase renamed the browser-facing key from "anon" to "publishable"
     * when it introduced the `sb_publishable_…` format. Both variables are
     * read, preferring the current name, so that a value copied straight out
     * of the dashboard works and an older deployment keeps running.
     */
    publishableKey: readText(
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
      readText(env.VITE_SUPABASE_ANON_KEY, ''),
    ),
  },

  /**
   * Entra app registration used for single sign-on.
   *
   * Both values are public identifiers, not secrets: a single-page
   * application cannot hold a client secret, which is why the flow is
   * delegated and every request runs as the signed-in person.
   */
  entra: {
    clientId: env.VITE_ENTRA_CLIENT_ID ?? '',
    tenantId: env.VITE_ENTRA_TENANT_ID ?? '',
  },
} as const
