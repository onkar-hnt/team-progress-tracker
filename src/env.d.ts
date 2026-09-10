/// <reference types="vite/client" />

/**
 * Typed build-time configuration.
 *
 * Everything here ships to the browser, so these keys may hold locations and
 * public client ids but must never hold secrets.
 */
interface ImportMetaEnv {
  /** `mock` (default) or `sharepoint-excel`. */
  readonly VITE_DATA_SOURCE?: string

  /** Artificial provider delay, useful for checking loading states. */
  readonly VITE_MOCK_LATENCY_MS?: string

  readonly VITE_SHAREPOINT_SITE_URL?: string

  /** Path to the workbook within the document library. */
  readonly VITE_SHAREPOINT_WORKBOOK_PATH?: string

  /**
   * Sharing URL of the workbook.
   *
   * Anyone holding this URL can reach the file, so it is supplied through
   * `.env.local` (untracked) rather than committed.
   */
  readonly VITE_SHAREPOINT_WORKBOOK_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
