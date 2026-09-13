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

function createGraphGateway(): WorkbookGateway {
  if (appConfig.sharePoint.workbookUrl === '') return new UnconfiguredWorkbookGateway()

  return new GraphWorkbookGateway({
    workbookUrl: appConfig.sharePoint.workbookUrl,
    getAccessToken: async () => {
      const { acquireGraphToken } = await import('@services/auth/entra/msal-client')
      return acquireGraphToken()
    },
  })
}

function createWorkbookGateway(): WorkbookGateway | null {
  switch (appConfig.dataSource) {
    case 'local-excel': {
      const store = getWorkbookFileStore()

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

export function createDataProvider(): DataProvider {
  if (appConfig.dataSource === 'supabase') {
    return new SupabaseDataProvider({ client: getSupabaseClient() })
  }

  const gateway = getWorkbookGateway()

  return gateway === null
    ? new MockDataProvider({ latencyMs: appConfig.mock.latencyMs })
    : new ExcelDataProvider({ gateway })
}

let cachedProvider: DataProvider | undefined
let cachedGateway: WorkbookGateway | null | undefined

export function getDataProvider(): DataProvider {
  cachedProvider ??= createDataProvider()
  return cachedProvider
}

export function getWorkbookGateway(): WorkbookGateway | null {
  if (cachedGateway === undefined) cachedGateway = createWorkbookGateway()
  return cachedGateway
}

subscribeToWorkbookConnection(() => {
  cachedProvider = undefined
  cachedGateway = undefined
})
