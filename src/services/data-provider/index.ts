import { appConfig } from '@config/app.config'
import { acquireGraphToken } from '@services/auth/entra/msal-client'

import type { DataProvider } from './data-provider.interface'
import { ExcelDataProvider } from './excel/excel-data-provider'
import { GraphWorkbookGateway } from './excel/graph-workbook-gateway'
import { UnconfiguredWorkbookGateway } from './excel/workbook-gateway'
import type { WorkbookGateway } from './excel/workbook-gateway'
import { MockDataProvider } from './mock/mock-data-provider'

export type { DataProvider, DataProviderCapabilities } from './data-provider.interface'
export * from './data-provider.errors'

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
    // by MSAL, rather than captured once and left to expire.
    getAccessToken: acquireGraphToken,
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
