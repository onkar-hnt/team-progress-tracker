/// <reference types="vite/client" />

/**
 * Typed environment variables, so a missing or misspelled one is a compile
 * error rather than an `undefined` that only shows up at runtime. Every
 * `VITE_` variable is inlined into the bundle: nothing secret may go here.
 */
interface ImportMetaEnv {
  /**
   * The bootstrap administrator, the only account not held in the database.
   * Override all three on any deployment reachable beyond the team.
   */
  readonly VITE_ADMIN_EMAIL?: string
  readonly VITE_ADMIN_NAME?: string
  readonly VITE_ADMIN_PASSWORD?: string

  /**
   * `supabase`, `entra` or `local`. Unset for automatic selection; needed only
   * to force roster passwords, which is never selected on its own.
   */
  readonly VITE_AUTH_MODE?: string

  /** Project URL, or the `http://127.0.0.1:54321` that `supabase start` serves. */
  readonly VITE_SUPABASE_URL?: string

  /**
   * Public by design: it names the project rather than the caller, and Row
   * Level Security is what decides access. A `service_role` or `sb_secret_…`
   * key here would bypass every policy, so the client rejects one outright.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string

  /**
   * Former name for {@link VITE_SUPABASE_PUBLISHABLE_KEY}, still read so a
   * deployment configured before the rename keeps working.
   */
  readonly VITE_SUPABASE_ANON_KEY?: string

  /** Entra single sign-on. Public identifiers; empty means roster passwords. */
  readonly VITE_ENTRA_CLIENT_ID?: string
  readonly VITE_ENTRA_TENANT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
