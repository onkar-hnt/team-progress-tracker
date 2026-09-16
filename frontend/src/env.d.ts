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
   * The bootstrap administrator, the only account not held in the database.
   *
   * Override all three on any deployment reachable beyond the team: the
   * defaults are in the public bundle.
   */
  readonly VITE_ADMIN_EMAIL?: string
  readonly VITE_ADMIN_NAME?: string
  readonly VITE_ADMIN_PASSWORD?: string

  /**
   * `api`, `entra` or `local`. Leave unset for automatic selection.
   *
   * Only needed to force the roster password provider (`local`), which is
   * never selected automatically.
   */
  readonly VITE_AUTH_MODE?: string

  /**
   * Origin of the API Gateway, such as `http://localhost:5100`.
   *
   * Also accepts a same-origin prefix such as `/api` for a deployment that
   * reverse-proxies the gateway behind the web server. Defaults to the
   * gateway's development address.
   */
  readonly VITE_API_BASE_URL?: string

  /**
   * Entra app registration, used for single sign-on. Public identifiers, not
   * secrets.
   *
   * Leave both empty to sign in with roster passwords instead.
   */
  readonly VITE_ENTRA_CLIENT_ID?: string
  readonly VITE_ENTRA_TENANT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
