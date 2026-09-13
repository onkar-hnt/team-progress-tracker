import { appConfig } from '@config/app.config'
import { AuthError } from '@services/auth/auth.errors'
import { subscribeToWorkbookConnection } from '@services/data-provider/workbook-connection'
import { DataProviderError } from '@services/data-provider/data-provider.errors'
import type { WorkbookStructureReport } from '@services/data-provider/excel/ensure-workbook-structure'

import { getAdminWorkbookService } from './admin-workbook.service'

export type AdminWorkbookInitialisationStatus =
  /** Not attempted yet: nobody has signed in as an administrator. */
  | 'idle'
  /** Checking the workbook, and creating anything missing. */
  | 'initialising'
  /** The workbook has every sheet and column the application needs. */
  | 'ready'
  /** The workbook could not be prepared. `error` says why. */
  | 'failed'
  /** There is nothing to prepare, as with mock data or a missing registration. */
  | 'not-applicable'

export interface AdminWorkbookInitialisation {
  status: AdminWorkbookInitialisationStatus

  /** What the last completed run found and changed. */
  report: WorkbookStructureReport | null

  /** A readable reason, when the workbook could not be prepared. */
  error: string | null
}

const IDLE: AdminWorkbookInitialisation = { status: 'idle', report: null, error: null }

let state: AdminWorkbookInitialisation = IDLE
let pending: Promise<AdminWorkbookInitialisation> | null = null

let hasSettled = false

const listeners = new Set<() => void>()

function set(next: AdminWorkbookInitialisation): void {
  state = next
  for (const listener of listeners) listener()
}

export function subscribeToAdminWorkbookInitialisation(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAdminWorkbookInitialisation(): AdminWorkbookInitialisation {
  return state
}

export function initialiseAdminWorkbook(): Promise<AdminWorkbookInitialisation> {
  if (pending !== null) return pending
  if (hasSettled) return Promise.resolve(state)

  return start()
}

export function retryAdminWorkbookInitialisation(): Promise<AdminWorkbookInitialisation> {
  if (pending !== null) return pending

  hasSettled = false
  return start()
}

export function resetAdminWorkbookInitialisation(): void {
  hasSettled = false
  if (state !== IDLE) set(IDLE)
}

function start(): Promise<AdminWorkbookInitialisation> {
  const service = getAdminWorkbookService()

  const unavailable = service.getUnavailabilityReason()
  if (unavailable !== null) {
    hasSettled = true
    set({ status: 'not-applicable', report: null, error: unavailable })
    report(`skipped for data source "${appConfig.dataSource}": ${unavailable}`)
    return Promise.resolve(state)
  }

  set({ status: 'initialising', report: null, error: null })
  report(`started for data source "${appConfig.dataSource}"`)

  const run = execute(service.ensureStructure())
  pending = run

  void run.finally(() => {
    if (pending === run) pending = null
  })

  return run
}

async function execute(
  work: Promise<WorkbookStructureReport>,
): Promise<AdminWorkbookInitialisation> {
  try {
    const result = await work
    hasSettled = true
    set({ status: 'ready', report: result, error: null })
    report(describeChanges(result))
  } catch (error) {
    hasSettled = true
    set({ status: 'failed', report: null, error: describeFailure(error) })
    report(`failed: ${describeFailure(error)}`, 'error')
  }

  return state
}

function describeChanges(result: WorkbookStructureReport): string {
  const changes = [
    ...result.createdTables.map((table) => `created table ${table}`),
    ...result.addedColumns.map(
      (entry) => `added columns to ${entry.tableName}: ${entry.columns.join(', ')}`,
    ),
  ]

  if (changes.length > 0) return `completed — ${changes.join('; ')}`
  return result.isReady
    ? 'completed — workbook already correct, nothing changed'
    : 'completed — structure is incomplete and this connection cannot repair it'
}

function describeFailure(error: unknown): string {
  if (error instanceof DataProviderError || error instanceof AuthError) return error.message

  return 'The Admin workbook could not be prepared. Check the workbook link and your access to it.'
}

function report(message: string, level: 'error' | 'info' = 'info'): void {
  const line = `[admin-workbook] initialisation ${message}`

  if (level === 'error') console.error(line)
  else console.info(line)
}

subscribeToWorkbookConnection(() => {
  resetAdminWorkbookInitialisation()
})
