import { getSupabaseClient } from '@services/supabase/index'

import type { DataProvider } from './data-provider.interface'
import { SupabaseDataProvider } from './supabase/supabase-data-provider'

export type { DataProvider, DataProviderCapabilities } from './data-provider.interface'
export * from './data-provider.errors'

export function createDataProvider(): DataProvider {
  return new SupabaseDataProvider({ client: getSupabaseClient() })
}

let cachedProvider: DataProvider | undefined

export function getDataProvider(): DataProvider {
  cachedProvider ??= createDataProvider()
  return cachedProvider
}
