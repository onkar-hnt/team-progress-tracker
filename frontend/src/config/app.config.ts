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
   * Left blank normally: `createAuthProvider` signs in against the API, and
   * falls back to Entra when an app registration is configured instead.
   * Setting this pins the choice, which is how the offline fallback becomes
   * an explicit decision rather than something the application can slip into
   * on its own.
   */
  authMode: readText(env.VITE_AUTH_MODE, ''),

  /**
   * Where the API Gateway answers. Every request the app makes goes through
   * it, so no service URL appears anywhere else.
   *
   * Public by design — it is a URL, not a credential. Access is decided by
   * the access token the Identity service issues at sign-in.
   */
  api: {
    baseUrl: readText(env.VITE_API_BASE_URL, 'http://localhost:5100'),
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
