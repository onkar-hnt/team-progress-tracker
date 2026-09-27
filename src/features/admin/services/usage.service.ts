import { z } from 'zod'

import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import {
  getSupabaseClient,
  getSupabaseConfig,
  isSupabaseConfigured,
} from '@services/supabase/index'
import { GIGABYTE, MEGABYTE } from '@utils/bytes.utils'

export function isUsageAvailable(): boolean {
  return isSupabaseConfigured()
}

/** One table, as the breakdown lists it. */
export interface TableUsage {
  /** The Postgres table name, shown as it is: this is a database screen. */
  name: string

  rows: number

  /** Heap, indexes, toast and free space — what the plan counts. */
  totalBytes: number

  /** Part of `totalBytes`, broken out so a runaway index is visible. */
  indexBytes: number
}

export interface ResourceUsage {
  /** When the server measured, not when the browser asked. */
  measuredAt: string

  databaseBytes: number

  /** Largest first, which is the order the question is asked in. */
  tables: TableUsage[]

  storageBytes: number
  storageObjects: number

  /** Every login that exists. */
  accounts: number

  /** Those that have signed in within the last thirty days. */
  activeAccounts: number

  /** Absent in a project where nothing has been written yet. */
  lastWriteAt?: string
}

export const FREE_PLAN = {
  databaseBytes: 500 * MEGABYTE,
  storageBytes: GIGABYTE,
  monthlyActiveUsers: 50_000,

  /** Not measurable from here; stated so the screen can say what it is missing. */
  egressBytes: 5 * GIGABYTE,
  edgeInvocations: 500_000,
  realtimeMessages: 2_000_000,

  /** Days of no activity after which a free project is paused. */
  inactivityPauseDays: 7,
} as const

export function usageDashboardUrl(): string | null {
  try {
    const { hostname } = new URL(getSupabaseConfig().url)
    if (!hostname.endsWith('.supabase.co')) return null

    const reference = hostname.slice(0, hostname.indexOf('.'))
    if (reference === '') return null

    return `https://supabase.com/dashboard/project/${reference}/reports/usage`
  } catch {
    return null
  }
}

const tableUsageSchema = z.object({
  name: z.string().min(1),

  rows: z.number().nonnegative(),
  total_bytes: z.number().nonnegative(),
  index_bytes: z.number().nonnegative(),
})

const usageSchema = z.object({
  measured_at: z.string().min(1),
  database_bytes: z.number().nonnegative(),
  tables: z.array(tableUsageSchema),
  storage_bytes: z.number().nonnegative(),
  storage_objects: z.number().nonnegative(),
  accounts: z.number().nonnegative(),
  accounts_active_30d: z.number().nonnegative(),
  last_write_at: z.string().nullable(),
})

const MISSING_FUNCTION_CODES: ReadonlySet<string> = new Set(['42883', 'PGRST202'])

export async function readResourceUsage(): Promise<ResourceUsage> {
  if (!isUsageAvailable()) {
    throw new DataSourceUnavailableError(
      'Usage figures need the Supabase data source, which is not configured.',
    )
  }

  const { data, error } = await getSupabaseClient().rpc('resource_usage')

  if (error !== null) {
    if (MISSING_FUNCTION_CODES.has(error.code)) {
      throw new DataSourceUnavailableError(
        'Usage reporting is not set up in this database yet. Apply supabase/migrations/20260914000000_resource_usage.sql, then reload.',
        { cause: error },
      )
    }

    if (error.code === '42501') {
      throw new DataProviderError(error.message, { cause: error })
    }

    throw new DataProviderError('The usage figures could not be read.', { cause: error })
  }

  const parsed = usageSchema.safeParse(data)

  if (!parsed.success) {
    throw new DataProviderError(
      'The usage figures came back in an unexpected shape, so they cannot be shown.',
      { cause: parsed.error },
    )
  }

  const usage = parsed.data

  return {
    measuredAt: usage.measured_at,
    databaseBytes: usage.database_bytes,

    tables: usage.tables
      .map((table) => ({
        name: table.name,
        rows: table.rows,
        totalBytes: table.total_bytes,
        indexBytes: table.index_bytes,
      }))
      .sort((left, right) => right.totalBytes - left.totalBytes),

    storageBytes: usage.storage_bytes,
    storageObjects: usage.storage_objects,
    accounts: usage.accounts,
    activeAccounts: usage.accounts_active_30d,
    ...(usage.last_write_at === null ? {} : { lastWriteAt: usage.last_write_at }),
  }
}

/** A used-against-allowance pair as a percentage, clamped for display. */
export function usedPercent(used: number, allowance: number): number {
  if (allowance <= 0) return 0

  return Math.min(100, (used / allowance) * 100)
}
