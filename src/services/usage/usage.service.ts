import { z } from 'zod'

import { appConfig } from '@config/app.config'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import {
  getSupabaseClient,
  getSupabaseConfig,
  isSupabaseConfigured,
} from '@services/supabase/index'
import { GIGABYTE, MEGABYTE } from '@utils/bytes.utils'

/**
 * How much of the project's allowance has been used.
 *
 * ## Why the application asks at all
 *
 * Because it is running on a free project, and the two things that end a free project
 * are silent until they happen: the database fills up, or nobody writes anything for a
 * week and it is paused. Both are visible in the Supabase dashboard, which is behind a
 * different login from this application's — so the person who would act on the number
 * is not the person who sees it. This screen closes that gap.
 *
 * ## What it can and cannot answer
 *
 * Everything here comes from `public.resource_usage()`, which reads the database's own
 * catalogue and the storage and auth schemas. That covers the caps that are actually
 * near: database bytes, file bytes, accounts, and when work last landed.
 *
 * It does not cover egress, Edge Function invocations or realtime messages. Those are
 * metered by the platform, and the only way to them is the Management API with a
 * personal access token — a credential with rights over the entire project, which is
 * not something to put behind a browser screen even by way of an Edge Function. The
 * screen names them as unmeasured and links out, which is the honest shape of it.
 *
 * ## Why it is not on `DataProvider`
 *
 * The fifth module to make this argument, after notifications, accounts, the recycle
 * bin and the change log. `DataProvider` is the seam that makes the record store
 * replaceable; a workbook has no size limit to report, no storage bucket and no
 * accounts. So this is a Supabase feature and says so through `isUsageAvailable`.
 */

export function isUsageAvailable(): boolean {
  return appConfig.dataSource === 'supabase' && isSupabaseConfigured()
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

/**
 * The free plan's allowances, as Supabase publishes them.
 *
 * Held here rather than read from anywhere, because there is nowhere to read them
 * from: the database does not know which plan pays for it. That makes them a figure
 * that can go out of date, so the screen labels them as the free plan's rather than
 * as "the limit", and the two that this application cannot measure are listed beside
 * the two it can — a reader comparing against the wrong plan is a worse outcome than
 * a reader who has to check one number.
 */
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

/**
 * Where in the Supabase dashboard the rest of the numbers are.
 *
 * Built from the configured project URL, so the link lands on this project rather than
 * on a chooser. `null` for a local stack, whose host carries no project reference and
 * whose usage is a laptop's disk rather than a plan.
 */
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

  // `bigint` columns arrive as numbers through PostgREST's json, and every value here
  // is a byte or row count on a project capped at 500 MB — so nothing can approach the
  // precision limit of a double. Validated as numbers rather than coerced from strings
  // for that reason.
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

/**
 * A missing function means the migration has not been applied.
 *
 * `42883` is Postgres on an unknown function and `PGRST202` is PostgREST's schema
 * cache saying the same. Named outright, because the generic wording sends whoever hit
 * it looking for a network fault instead of a pending deploy.
 */
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

    // The function refuses a non-administrator with a message written for a reader,
    // and that refusal is the one worth repeating verbatim.
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

    // Sorted here rather than in the function, which returns them by name: the screen
    // wants the biggest first, and a table's size is the reason anybody opened it.
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
