import { appConfig } from '@config/app.config'
import { AuthError } from '@services/auth/auth.errors'
import { subscribeToWorkbookConnection } from '@services/data-provider/workbook-connection'
import { DataProviderError } from '@services/data-provider/data-provider.errors'
import type { WorkbookStructureReport } from '@services/data-provider/excel/ensure-workbook-structure'

import { getAdminWorkbookService } from './admin-workbook.service'

/**
 * Startup initialisation of the Admin workbook.
 *
 * Signing in as an administrator is the point at which the workbook first
 * needs to be usable, so that is when its structure is checked and any
 * missing sheets, tables or columns are created. Doing it here rather than on
 * a screen means nobody has to remember to visit Settings, and no page
 * component decides when the data source gets prepared.
 *
 * Three properties matter, and they are why this is a small observable store
 * rather than a hook or a query:
 *
 * - It runs once per session. React mounts effects twice under StrictMode,
 *   providers re-render, and guards remount on navigation; none of that may
 *   start a second run against the workbook.
 * - It never blocks sign-in. Authentication has already succeeded by the time
 *   this starts, and a workbook fault is reported as a data-source problem
 *   rather than turning into a rejected sign-in or a redirect loop.
 * - Its progress is observable by components that want to show it, without
 *   any of them being responsible for triggering it. The workbook connection
 *   store next door works the same way, for the same reason.
 */

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

/**
 * Whether a run has already settled for this session.
 *
 * Separate from `state` because a failed run has still been attempted:
 * without this, an effect that re-fires after a failure would retry forever.
 * Only an explicit retry clears it.
 */
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

/**
 * The current state.
 *
 * Returns the same object until something changes, which is what
 * `useSyncExternalStore` requires to avoid re-rendering on every check.
 */
export function getAdminWorkbookInitialisation(): AdminWorkbookInitialisation {
  return state
}

/**
 * Prepares the workbook, at most once per session.
 *
 * Safe to call from an effect: a second call while the first is running
 * returns the same promise, and a call after one has settled returns the
 * result without touching the workbook again.
 */
export function initialiseAdminWorkbook(): Promise<AdminWorkbookInitialisation> {
  if (pending !== null) return pending
  if (hasSettled) return Promise.resolve(state)

  return start()
}

/**
 * Re-checks the workbook after the administrator asked for it.
 *
 * The manual action in Settings, and the way to recover from a failure once
 * the cause has been fixed. It still joins a run already in progress rather
 * than starting a rival one, because both would be writing to the same file.
 */
export function retryAdminWorkbookInitialisation(): Promise<AdminWorkbookInitialisation> {
  if (pending !== null) return pending

  hasSettled = false
  return start()
}

/**
 * Forgets that initialisation happened.
 *
 * Called when the session ends or the workbook changes, so the next
 * administrator to sign in gets a fresh check rather than inheriting a result
 * that described a different file or a different moment.
 */
export function resetAdminWorkbookInitialisation(): void {
  hasSettled = false
  if (state !== IDLE) set(IDLE)
}

function start(): Promise<AdminWorkbookInitialisation> {
  const service = getAdminWorkbookService()

  // Resolved from configuration, so a deployment with no workbook or no app
  // registration settles here without a request and keeps showing the
  // existing data-source warning rather than reporting a failed repair.
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

/**
 * Records the outcome and never rejects.
 *
 * The result belongs in the store, where the UI can show it, rather than in
 * an exception the caller has to remember to catch — this is started by a
 * fire-and-forget effect whose only job is to begin the work.
 */
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

/**
 * Diagnostics for the one thing that happens before any screen is used.
 *
 * Deliberately limited to the data source, the lifecycle and the names of
 * structures that were created. Tokens, authorization headers, credentials
 * and workbook rows are never passed here.
 */
function report(message: string, level: 'error' | 'info' = 'info'): void {
  const line = `[admin-workbook] initialisation ${message}`

  if (level === 'error') console.error(line)
  else console.info(line)
}

// Pointing the application at a different workbook invalidates the result:
// the new file has its own structure and has to be checked on its own terms.
subscribeToWorkbookConnection(() => {
  resetAdminWorkbookInitialisation()
})
