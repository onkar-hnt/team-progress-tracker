import type { DataProvider } from './data-provider.interface'
import { HttpDataProvider } from './http/http-data-provider'

export type { DataProvider, DataProviderCapabilities } from './data-provider.interface'
export * from './data-provider.errors'

export function createDataProvider(): DataProvider {
  return new HttpDataProvider()
}

let cachedProvider: DataProvider | undefined

export function getDataProvider(): DataProvider {
  cachedProvider ??= createDataProvider()
  return cachedProvider
}
