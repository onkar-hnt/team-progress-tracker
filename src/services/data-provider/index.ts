import { appConfig } from '@config/app.config'
import { getSupabaseClient } from '@services/supabase/index'

import type { DataProvider } from './data-provider.interface'
import { ExcelDataProvider } from './excel/excel-data-provider'
import { FileWorkbookGateway } from './excel/file-workbook-gateway'
import { GraphWorkbookGateway } from './excel/graph-workbook-gateway'
import { getMemoryWorkbookGateway } from './excel/memory-workbook-gateway'
import { UnconfiguredWorkbookGateway } from './excel/workbook-gateway'
import type { WorkbookGateway } from './excel/workbook-gateway'
import { MockDataProvider } from './mock/mock-data-provider'
import { SupabaseDataProvider } from './supabase/supabase-data-provider'
import { getWorkbookFileStore, subscribeToWorkbookConnection } from './workbook-connection'

export type { DataProvider, DataProviderCapabilities } from './data-provider.interface'
export * from './data-provider.errors'
export * from './workbook-connection'

/**
 * Builds the Graph transport.
 *
 * The Graph gateway is only usable once a workbook URL is configured, so an
 * unconfigured deployment gets the placeholder and a clear message rather
 * than requests that fail with a network error.
 */
function createGraphGateway(): WorkbookGateway {
  if (appConfig.sharePoint.workbookUrl === '') return new UnconfiguredWorkbookGateway()

  return new GraphWorkbookGateway({
    workbookUrl: appConfig.sharePoint.workbookUrl,
    // Passed as a function so the token is fetched per request and refreshed
    // by MSAL, rather than captured once and left to expire. MSAL is imported
    // on demand to keep it out of the initial bundle; by the time a workbook
    // read happens the module is already loaded and cached by sign-in.
    getAccessToken: async () => {
      const { acquireGraphToken } = await import('@services/auth/entra/msal-client')
      return acquireGraphToken()
    },
  })
}

/**
 * Builds the workbook transport selected by configuration.
 *
 * `null` for the sources that read no workbook: `mock`, which reads fixtures,
 * and `supabase`, where the records live in PostgreSQL. Returning `null`
 * rather than a placeholder is what keeps the startup workbook check from
 * running against a source that has no workbook to check.
 */
function createWorkbookGateway(): WorkbookGateway | null {
  switch (appConfig.dataSource) {
    case 'local-excel': {
      const store = getWorkbookFileStore()

      // Until somebody picks the file there is nothing to read. The
      // placeholder reports that as an explanatory error, and the connection
      // screen in the UI is what resolves it.
      return store === null ? new UnconfiguredWorkbookGateway() : new FileWorkbookGateway(store)
    }

    case 'memory-excel':
      return getMemoryWorkbookGateway()

    case 'sharepoint-excel':
      return createGraphGateway()

    case 'mock':
    case 'supabase':
      return null
  }
}

/**
 * Builds the provider selected by configuration.
 *
 * This function is the only place in the application that knows which
 * backends exist. Adding a REST or SQL backed provider means adding a branch
 * here; no feature code changes.
 */
export function createDataProvider(): DataProvider {
  const gateway = getWorkbookGateway()

  const workbookOrFixtures: DataProvider =
    gateway === null
      ? new MockDataProvider({ latencyMs: appConfig.mock.latencyMs })
      : new ExcelDataProvider({ gateway })

  if (appConfig.dataSource !== 'supabase') return workbookOrFixtures

  // The fixtures stand in for the entities still being migrated, so the rest
  // of the application keeps working while they are moved across one at a
  // time. That delegate goes away with the last phase, at which point this
  // becomes a plain `new SupabaseDataProvider({ client })`.
  return new SupabaseDataProvider({
    client: getSupabaseClient(),
    unmigrated: workbookOrFixtures,
  })
}

let cachedProvider: DataProvider | undefined
let cachedGateway: WorkbookGateway | null | undefined

/**
 * Shared provider instance.
 *
 * The mock and in-memory sources hold their writes in memory, so this must be
 * a singleton for saved records to be visible across screens.
 */
export function getDataProvider(): DataProvider {
  cachedProvider ??= createDataProvider()
  return cachedProvider
}

/**
 * The workbook transport currently in use, or `null` when there is none.
 *
 * Exposed for workbook administration — validating the connection and
 * checking the file's structure — which is about the workbook itself rather
 * than the records in it, and so has no place on `DataProvider`. Feature code
 * reaches this through the admin workbook service, never directly.
 */
export function getWorkbookGateway(): WorkbookGateway | null {
  if (cachedGateway === undefined) cachedGateway = createWorkbookGateway()
  return cachedGateway
}

// Choosing a different workbook has to produce a provider bound to the new
// file, so the cached pair is discarded whenever the connection changes.
subscribeToWorkbookConnection(() => {
  cachedProvider = undefined
  cachedGateway = undefined
})
