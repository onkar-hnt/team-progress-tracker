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
  /** `mock` or `sharepoint-excel`. Defaults to `mock`. */
  readonly VITE_DATA_SOURCE?: string

  /** Artificial delay for the mock provider, in milliseconds. */
  readonly VITE_MOCK_LATENCY_MS?: string

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
