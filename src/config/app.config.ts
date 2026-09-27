/**
 * Vite injects `import.meta.env` at build time. The fallback keeps this module
 * importable from plain Node, which is what lets scripts and unit tests
 * exercise the data layer.
 */
const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

/** Treats a blank variable as absent, which is how an unset `.env` key reads. */
function readText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

/** Resolved configuration, and the only place `import.meta.env` is read. */
export const appConfig = {
  /**
   * Pins the identity source. Left blank normally, so `createAuthProvider`
   * picks Supabase, then Entra, then roster passwords — which keeps the
   * offline fallback an explicit decision rather than something the
   * application can slip into on its own.
   */
  authMode: readText(env.VITE_AUTH_MODE, ''),

  supabase: {
    url: readText(env.VITE_SUPABASE_URL, ''),

    /**
     * Public by design: the key identifies the project rather than the caller,
     * and Row Level Security decides what a caller may read or write. Blank
     * until a project exists, which is why nothing here throws.
     *
     * Both names are read, preferring the current one, so a value copied from
     * the dashboard works and an older deployment keeps running.
     */
    publishableKey: readText(
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
      readText(env.VITE_SUPABASE_ANON_KEY, ''),
    ),
  },

  /** Public identifiers, not secrets: a single-page application cannot hold one. */
  entra: {
    clientId: env.VITE_ENTRA_CLIENT_ID ?? '',
    tenantId: env.VITE_ENTRA_TENANT_ID ?? '',
  },
} as const
