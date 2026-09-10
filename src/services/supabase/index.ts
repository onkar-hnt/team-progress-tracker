/**
 * Supabase access, shared by the auth layer and the data layer.
 *
 * Neither feature code nor components import from here: sign-in goes through
 * `@services/auth`, and records go through the `DataProvider` boundary in
 * `@services/data-provider`. This module exists so those two have one client
 * and one definition of "configured" between them.
 */
export { getSupabaseClient } from './supabase-client'
export type { AppSupabaseClient } from './supabase-client'
export {
  classifySupabaseKey,
  describeSupabaseConfigProblem,
  getSupabaseConfig,
  inspectSupabaseConfig,
  isSupabaseConfigured,
} from './supabase-config'
export type { SupabaseConfig, SupabaseKeyKind } from './supabase-config'
export { SupabaseConfigurationError } from './supabase.errors'
export type { SupabaseConfigProblem } from './supabase.errors'
