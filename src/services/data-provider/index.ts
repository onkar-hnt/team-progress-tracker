import { appConfig } from '@config/app.config'

import type { DataProvider } from './data-provider.interface'
import { ExcelDataProvider } from './excel/excel-data-provider'
import { FileWorkbookGateway } from './excel/file-workbook-gateway'
import { GraphWorkbookGateway } from './excel/graph-workbook-gateway'
import { UnconfiguredWorkbookGateway } from './excel/workbook-gateway'
import type { WorkbookGateway } from './excel/workbook-gateway'
import { MockDataProvider } from './mock/mock-data-provider'
import { getWorkbookFileStore, subscribeToWorkbookConnection } from './workbook-connection'

export type { DataProvider, DataProviderCapabilities } from './data-provider.interface'
export * from './data-provider.errors'
export * from './workbook-connection'

/**
 * Builds the transport for the Excel provider.
 *
 * The Graph gateway is only usable once a workbook URL is configured, so an
 * unconfigured deployment gets the placeholder and a clear message rather
 * than requests that fail with a network error.
 */
function createWorkbookGateway(): WorkbookGateway {
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
 * Builds the provider selected by configuration.
 *
 * This function is the only place in the application that knows which
 * backends exist. Adding a REST or SQL backed provider means adding a branch
 * here; no feature code changes.
 */
export function createDataProvider(): DataProvider {
  switch (appConfig.dataSource) {
    case 'local-excel': {
      const store = getWorkbookFileStore()

      // Until somebody picks the file there is nothing to read. The
      // placeholder reports that as an explanatory error, and the connection
      // screen in the UI is what resolves it.
      return new ExcelDataProvider({
        gateway: store === null ? new UnconfiguredWorkbookGateway() : new FileWorkbookGateway(store),
      })
    }

    case 'sharepoint-excel':
      return new ExcelDataProvider({ gateway: createWorkbookGateway() })

    case 'mock':
      return new MockDataProvider({ latencyMs: appConfig.mock.latencyMs })
  }
}

let cachedProvider: DataProvider | undefined

/**
 * Shared provider instance.
 *
 * The mock provider holds in-memory writes, so it must be a singleton for
 * saved entries to be visible across screens.
 */
export function getDataProvider(): DataProvider {
  cachedProvider ??= createDataProvider()
  return cachedProvider
}

// Choosing a different workbook has to produce a provider bound to the new
// file, so the cached one is discarded whenever the connection changes.
subscribeToWorkbookConnection(() => {
  cachedProvider = undefined
})
