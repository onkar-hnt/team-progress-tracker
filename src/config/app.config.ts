import { WORKBOOK_FILE_NAME } from '@services/data-provider/excel/excel-schema'

/**
 * Where records are read from and written to.
 *
 * - `local-excel` opens the `.xlsx` itself, pointed at the OneDrive-synced
 *   copy on disk. Real Excel read and write with no app registration.
 * - `sharepoint-excel` goes through Microsoft Graph, which needs an Entra
 *   registration but works without a synced copy of the file.
 * - `memory-excel` holds a workbook in memory, exercising the same tables,
 *   mappers and structure checks as the real thing. Development only.
 * - `mock` reads the fixtures in `src/data`, for development only.
 * - `supabase` is PostgreSQL through Supabase, with row-level security. The
 *   intended production source; the Excel modes remain for import, export and
 *   reporting rather than as the live database.
 */
export const DATA_SOURCE_MODES = [
  'local-excel',
  'memory-excel',
  'mock',
  'sharepoint-excel',
  'supabase',
] as const

export type DataSourceMode = (typeof DATA_SOURCE_MODES)[number]

export const DATA_SOURCE_LABELS: Readonly<Record<DataSourceMode, string>> = {
  'local-excel': 'Excel workbook on this computer',
  'memory-excel': 'Temporary in-memory workbook (development only)',
  mock: 'Sample data built into the app',
  'sharepoint-excel': 'SharePoint workbook via Microsoft Graph',
  supabase: 'Supabase (PostgreSQL)',
}

/**
 * Vite injects `import.meta.env` at build time. Falling back to an empty
 * object keeps the module importable from plain Node, which is what allows
 * the data layer to be exercised by scripts and unit tests.
 */
const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

function readDataSourceMode(): DataSourceMode {
  const configured = env.VITE_DATA_SOURCE

  // The in-memory workbook rather than the fixtures, so an unconfigured
  // deployment still exercises the Excel path end to end and admin writes
  // survive long enough to be seen.
  return DATA_SOURCE_MODES.includes(configured as DataSourceMode)
    ? (configured as DataSourceMode)
    : 'memory-excel'
}

/** Treats a blank variable as absent, which is how an unset `.env` key reads. */
function readText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? fallback : trimmed
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * The Admin workbook, as one named constant.
 *
 * Centralised here so that no component, service or hook carries the URL, and
 * so the administrator never has to supply it per session: the deployment
 * supplies it once and the application resolves the workbook from there.
 *
 * SECURITY: a SharePoint sharing link is itself an access grant — the link
 * alone opens the file — and everything in this bundle is readable by anyone
 * who loads the site. So it is configuration rather than a committed
 * constant, which is what keeps it out of a public repository and out of a
 * public build that has no business holding it.
 *
 * Blank is a supported state, not a broken one. Every consumer already
 * handles it: the Graph gateway reports itself unconfigured, the settings
 * page says so, and the header hides the workbook link. Nothing about
 * Supabase depends on it.
 */
export const ADMIN_DATA_SOURCE = {
  type: 'sharepoint-excel',
  url: readText(env.VITE_SHAREPOINT_WORKBOOK_URL, ''),
} as const satisfies { type: DataSourceMode; url: string }

/**
 * Resolved application configuration.
 *
 * Reading `import.meta.env` in exactly one place keeps environment handling
 * testable and stops feature code from depending on build-time details.
 */
export const appConfig = {
  dataSource: readDataSourceMode(),

  mock: {
    latencyMs: readPositiveInteger(env.VITE_MOCK_LATENCY_MS, 0),
  },

  /**
   * The Supabase project records are stored in.
   *
   * Both values are public. The URL identifies the project and the anon key
   * identifies the *project*, not the caller, so it is designed to ship in a
   * browser bundle. What a caller may read or write is decided by Supabase
   * Auth and Row Level Security in the database, never by keeping this key
   * hidden.
   *
   * Blank until a project exists, which is why nothing here throws: the
   * application still runs on the in-memory workbook without it. Validation
   * lives in `@services/supabase`, which refuses to build a client — rather
   * than failing later with a network error — when these are missing,
   * malformed, or a `service_role` key.
   */
  /**
   * Which identity source to use, overriding automatic selection.
   *
   * Left blank normally: `createAuthProvider` picks Supabase when a project
   * is configured, Entra when an app registration is, and the offline
   * workbook password otherwise. Setting this pins the choice, which is how
   * the offline fallback becomes an explicit decision rather than something
   * the application can slip into on its own.
   */
  authMode: readText(env.VITE_AUTH_MODE, ''),

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
   * Entra app registration used for sign-in and for the Graph token the
   * workbook is read with.
   *
   * Both values are public identifiers, not secrets: a single-page
   * application cannot hold a client secret, which is why the flow is
   * delegated and every request runs as the signed-in person.
   *
   * When these are empty the application falls back to workbook password
   * sign-in and mock data, so it still runs before the registration exists.
   */
  entra: {
    clientId: env.VITE_ENTRA_CLIENT_ID ?? '',
    tenantId: env.VITE_ENTRA_TENANT_ID ?? '',
  },

  /**
   * Workbook location. Unused until the Graph integration is built, but
   * defined now so deployment configuration can be prepared in parallel.
   */
  sharePoint: {
    siteUrl: env.VITE_SHAREPOINT_SITE_URL ?? '',
    workbookPath: env.VITE_SHAREPOINT_WORKBOOK_PATH ?? '',
    workbookFileName: WORKBOOK_FILE_NAME,

    /**
     * Sharing URL of the live workbook.
     *
     * Microsoft Graph can address a shared file directly from its sharing URL
     * via the `/shares` endpoint, which avoids having to discover and store a
     * drive id and item id up front.
     */
    workbookUrl: ADMIN_DATA_SOURCE.url,
  },
} as const
