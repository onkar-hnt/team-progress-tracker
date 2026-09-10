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
 */
export const DATA_SOURCE_MODES = [
  'local-excel',
  'memory-excel',
  'mock',
  'sharepoint-excel',
] as const

export type DataSourceMode = (typeof DATA_SOURCE_MODES)[number]

export const DATA_SOURCE_LABELS: Readonly<Record<DataSourceMode, string>> = {
  'local-excel': 'Excel workbook on this computer',
  'memory-excel': 'Temporary in-memory workbook (development only)',
  mock: 'Sample data built into the app',
  'sharepoint-excel': 'SharePoint workbook via Microsoft Graph',
}

/**
 * The Admin workbook, as one named constant.
 *
 * Centralised here so that no component, service or hook carries the URL, and
 * so the administrator never has to supply it: signing in is enough, and the
 * application resolves the workbook from configuration.
 *
 * SECURITY: a SharePoint sharing link is itself an access grant, and anything
 * in a `VITE_` variable or in this file ends up in the public bundle. The
 * default below is committed because this is a prototype against an
 * organisation-restricted link; set `VITE_SHAREPOINT_WORKBOOK_URL` to override
 * it, and move workbook access behind a backend before the app is reachable
 * beyond the team.
 */
export const ADMIN_DATA_SOURCE = {
  type: 'sharepoint-excel',
  url: 'https://hareandturtle-my.sharepoint.com/:x:/g/personal/o_ingawale_handt_ai/IQBwIUpi1s_DSbYwSEhNa0dXAUZVNx9T1UhXxrIkXkgnVgE?e=6KvjeC',
} as const satisfies { type: DataSourceMode; url: string }

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
     *
     * Defaults to the configured Admin workbook so the administrator never has
     * to enter it; the environment variable exists to point a deployment at a
     * different file without a code change.
     */
    workbookUrl: readText(env.VITE_SHAREPOINT_WORKBOOK_URL, ADMIN_DATA_SOURCE.url),
  },
} as const
