import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

import { getSupabaseConfig, inspectSupabaseConfig } from './supabase-config'
import { SupabaseConfigurationError } from './supabase.errors'

/**
 * The Supabase client type used throughout the application.
 *
 * Untyped against a schema for now. Once the initial migration exists and
 * `supabase gen types typescript` has been run, this alias becomes
 * `SupabaseClient<Database>` and every query is checked against the real
 * tables — a one-line change here rather than an edit at each call site.
 */
export type AppSupabaseClient = SupabaseClient

let cachedClient: AppSupabaseClient | undefined

/**
 * The shared Supabase client.
 *
 * A singleton because the auth client owns the session: a second instance
 * would keep its own copy, refresh the same token independently, and race the
 * first over the storage key.
 *
 * Throws `SupabaseConfigurationError` when the environment is incomplete.
 * Callers that can carry on without Supabase should ask
 * `isSupabaseConfigured()` first rather than catching this.
 */
export function getSupabaseClient(): AppSupabaseClient {
  if (cachedClient !== undefined) return cachedClient

  const config = getSupabaseConfig()
  const problems = inspectSupabaseConfig(config)
  if (problems.length > 0) throw new SupabaseConfigurationError(problems)

  cachedClient = createClient(config.url, config.publishableKey, {
    auth: {
      // Sessions outlive a reload, and the token is refreshed in the
      // background, so a signed-in admin is not logged out mid-task.
      persistSession: true,
      autoRefreshToken: true,

      // The application routes with `HashRouter`, so the fragment belongs to
      // the router. Letting the auth client parse it too would have the two
      // competing over the same URL. Nothing here needs it: sign-in is email
      // and password, which returns the session in the response.
      detectSessionInUrl: false,

      flowType: 'pkce',
    },
  })

  return cachedClient
}
