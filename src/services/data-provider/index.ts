import { appConfig } from '@config/app.config'

import type { DataProvider } from './data-provider.interface'
import { ExcelDataProvider } from './excel/excel-data-provider'
import { UnconfiguredWorkbookGateway } from './excel/workbook-gateway'
import { MockDataProvider } from './mock/mock-data-provider'

export type { DataProvider, DataProviderCapabilities } from './data-provider.interface'
export * from './data-provider.errors'

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
      // The gateway is a placeholder until the Graph integration lands, so
      // selecting this mode today fails with an explanatory message.
      return new ExcelDataProvider({ gateway: new UnconfiguredWorkbookGateway() })

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
