/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * Declaring them here means a missing or misspelled variable is a compile
 * error rather than an `undefined` that only shows up at runtime. Everything
 * in a Vite `VITE_` variable is public: it is inlined into the bundle, so
 * nothing secret may go here.
 */
interface ImportMetaEnv {
  /**
   * `local-excel`, `memory-excel`, `sharepoint-excel` or `mock`.
   *
   * Defaults to `memory-excel`, which exercises the real Excel path against a
   * workbook held in memory.
   */
  readonly VITE_DATA_SOURCE?: string

  /**
   * The bootstrap administrator, the only account not held in the workbook.
   *
   * Override all three on any deployment reachable beyond the team: the
   * defaults are in the public bundle.
   */
  readonly VITE_ADMIN_EMAIL?: string
  readonly VITE_ADMIN_NAME?: string
  readonly VITE_ADMIN_PASSWORD?: string

  /** Artificial delay for the mock provider, in milliseconds. */
  readonly VITE_MOCK_LATENCY_MS?: string

  /**
   * `supabase`, `entra` or `local`. Leave unset for automatic selection.
   *
   * Only needed to force the offline workbook password provider (`local`),
   * which is never selected automatically when Supabase is configured.
   */
  readonly VITE_AUTH_MODE?: string

  /**
   * Supabase project URL, such as `https://abcdefgh.supabase.co`.
   *
   * Also accepts the local `http://127.0.0.1:54321` used by `supabase start`.
   */
  readonly VITE_SUPABASE_URL?: string

  /**
   * Supabase publishable key, as shown in the dashboard.
   *
   * Public by design: it names the project rather than the caller, and Row
   * Level Security is what decides access. A `service_role` or `sb_secret_…`
   * key here would bypass every policy, so the client rejects one outright.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string

  /**
   * Former name for {@link VITE_SUPABASE_PUBLISHABLE_KEY}.
   *
   * Still read, so a deployment configured before Supabase renamed the key
   * keeps working. Prefer the publishable name for anything new.
   */
  readonly VITE_SUPABASE_ANON_KEY?: string

  /** Sharing URL of the live workbook, as copied from SharePoint or OneDrive. */
  readonly VITE_SHAREPOINT_WORKBOOK_URL?: string

  readonly VITE_SHAREPOINT_SITE_URL?: string
  readonly VITE_SHAREPOINT_WORKBOOK_PATH?: string

  /**
   * Entra app registration. Public identifiers, not secrets.
   *
   * Leave both empty to run on mock data with workbook password sign-in.
   */
  readonly VITE_ENTRA_CLIENT_ID?: string
  readonly VITE_ENTRA_TENANT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
