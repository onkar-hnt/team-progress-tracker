import { z } from 'zod'

import { apiEndpoints } from '@config/api'
import { apiGet } from '@services/api/api-client'
import { describeApiConfigProblem, isApiConfigured } from '@services/api/api-config'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'

export function isUsageAvailable(): boolean {
  return isApiConfigured()
}

/** One table, as the breakdown lists it. */
export interface TableUsage {
  /** Schema-qualified name, such as work.DailyUpdates. */
  name: string

  rows: number

  /** Heap and indexes — what the catalog reports for the table. */
  totalBytes: number

  /** Part of `totalBytes`, broken out so a runaway index is visible. */
  indexBytes: number
}

export interface ResourceUsage {
  /** When the server measured, not when the browser asked. */
  measuredAt: string

  databaseBytes: number

  /** Combined size of transaction log files for this database. */
  logBytes: number

  /** Per-database ceiling the Usage screen compares against (SQL Server Express default). */
  maxDatabaseBytes: number

  /** Largest first, which is the order the question is asked in. */
  tables: TableUsage[]

  /** Every login that exists. */
  accounts: number

  /** Profiles whose status is active; there is no last-sign-in column in this schema. */
  activeAccounts: number

  /** Absent in a project where nothing has been written yet. */
  lastWriteAt?: string
}

const tableUsageSchema = z.object({
  name: z.string().min(1),
  rows: z.number().nonnegative(),
  totalBytes: z.number().nonnegative(),
  indexBytes: z.number().nonnegative(),
})

const usageSchema = z.object({
  measuredAt: z.string().min(1),
  databaseBytes: z.number().nonnegative(),
  logBytes: z.number().nonnegative(),
  maxDatabaseBytes: z.number().nonnegative(),
  tables: z.array(tableUsageSchema),
  accounts: z.number().nonnegative(),
  activeAccounts: z.number().nonnegative(),
  lastWriteAt: z.string().nullable(),
})

export async function readResourceUsage(): Promise<ResourceUsage> {
  const problem = describeApiConfigProblem()

  if (problem !== null) {
    throw new DataSourceUnavailableError(`The API is not configured. ${problem}`)
  }

  const parsed = usageSchema.safeParse(await apiGet<unknown>(apiEndpoints.reports.usage))

  if (!parsed.success) {
    throw new DataProviderError(
      'The usage figures came back in an unexpected shape, so they cannot be shown.',
      { cause: parsed.error },
    )
  }

  const usage = parsed.data

  return {
    measuredAt: usage.measuredAt,
    databaseBytes: usage.databaseBytes,
    logBytes: usage.logBytes,
    maxDatabaseBytes: usage.maxDatabaseBytes,

    tables: [...usage.tables].sort((left, right) => right.totalBytes - left.totalBytes),

    accounts: usage.accounts,
    activeAccounts: usage.activeAccounts,
    ...(usage.lastWriteAt === null ? {} : { lastWriteAt: usage.lastWriteAt }),
  }
}

/** A used-against-allowance pair as a percentage, clamped for display. */
export function usedPercent(used: number, allowance: number): number {
  if (allowance <= 0) return 0

  return Math.min(100, (used / allowance) * 100)
}
