import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createSessionRecoveringFetch } from './session-recovering-fetch'
import { getSupabaseConfig, inspectSupabaseConfig } from './supabase-config'
import { SupabaseConfigurationError } from './supabase.errors'

export type AppSupabaseClient = SupabaseClient

let cachedClient: AppSupabaseClient | undefined

export function getSupabaseClient(): AppSupabaseClient {
  if (cachedClient !== undefined) return cachedClient

  const config = getSupabaseConfig()
  const problems = inspectSupabaseConfig(config)
  if (problems.length > 0) throw new SupabaseConfigurationError(problems)

  cachedClient = createClient(config.url, config.publishableKey, {
    global: { fetch: createSessionRecoveringFetch(() => cachedClient) },

    auth: {
      persistSession: true,
      autoRefreshToken: true,

      detectSessionInUrl: false,

      flowType: 'pkce',
    },
  })

  return cachedClient
}
