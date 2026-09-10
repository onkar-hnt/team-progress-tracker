import { WORKBOOK_FILE_NAME } from '@services/data-provider/excel/excel-schema'

export const DATA_SOURCE_MODES = ['mock', 'sharepoint-excel'] as const

export type DataSourceMode = (typeof DATA_SOURCE_MODES)[number]

/**
 * Vite injects `import.meta.env` at build time. Falling back to an empty
 * object keeps the module importable from plain Node, which is what allows
 * the data layer to be exercised by scripts and unit tests.
 */
const env: Partial<ImportMetaEnv> = import.meta.env ?? {}

function readDataSourceMode(): DataSourceMode {
  const configured = env.VITE_DATA_SOURCE

  return DATA_SOURCE_MODES.includes(configured as DataSourceMode)
    ? (configured as DataSourceMode)
    : 'mock'
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
    workbookUrl: env.VITE_SHAREPOINT_WORKBOOK_URL ?? '',
  },
} as const
