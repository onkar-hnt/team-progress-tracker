import { appConfig, DATA_SOURCE_LABELS } from '@config/app.config'
import { AuthError } from '@services/auth/auth.errors'
import { isEntraConfigured } from '@services/auth/entra/entra-config'
import { getWorkbookGateway } from '@services/data-provider/index'
import { DataProviderError } from '@services/data-provider/data-provider.errors'
import {
  ensureAdminWorkbookStructure,
  inspectAdminWorkbookStructure,
} from '@services/data-provider/excel/ensure-workbook-structure'
import type { WorkbookStructureReport } from '@services/data-provider/excel/ensure-workbook-structure'

/**
 * Administration of the Admin workbook, as opposed to its contents.
 *
 * Mentors, employees, projects and the rest are records, and they are read and
 * written through `WorkTrackerService` like everything else. This service
 * answers the questions that are about the *file*: can it be reached, may it
 * be written to, and does it have the sheets and columns the application
 * needs. Those have no place on `DataProvider`, whose job is records.
 *
 * It is also the only thing above the data layer that touches a workbook
 * gateway. Admin screens use the hooks in `use-admin-workbook`, so no
 * component ever holds a transport, a table name or the workbook URL.
 */

export interface AdminWorkbookStatus {
  /** The configured source, in words, for display. */
  sourceLabel: string

  /** Name of the transport actually in use. */
  transportName: string

  /** False when there is no workbook at all, as with the mock fixtures. */
  hasWorkbook: boolean

  isConnected: boolean
  canWrite: boolean

  /** True while records live somewhere temporary and will not survive a reload. */
  isTemporary: boolean

  /** Present when the workbook could be reached and its structure read. */
  structure: { missingTables: string[]; missingColumns: MissingColumnsSummary[] } | null

  /** A readable reason, when the workbook could not be reached. */
  error: string | null
}

export interface MissingColumnsSummary {
  tableName: string
  columns: string[]
}

/** Sources whose records do not outlive the browser tab. */
const TEMPORARY_SOURCES: readonly string[] = ['memory-excel', 'mock']

const NO_WORKBOOK_REASON =
  'The current data source is not a workbook, so there is no structure to check. ' +
  'Point the application at the Admin workbook first.'

const NO_REGISTRATION_REASON =
  'Unable to connect to the Admin data source. Reading a SharePoint workbook from a browser ' +
  'requires a Microsoft app registration, and none is configured, so no access token can be ' +
  'obtained for the file.'

export class AdminWorkbookService {
  /**
   * The run currently in progress, shared by every caller.
   *
   * Structure repair mutates the workbook, so two overlapping runs could each
   * decide a table is missing and create it twice. Holding the promise means
   * a second request joins the first rather than starting a rival one.
   */
  private inFlight: Promise<WorkbookStructureReport> | null = null

  /**
   * Why the workbook cannot be used at all, or `null` when it is worth
   * attempting.
   *
   * Answered from configuration alone, with no network access, so that a
   * deployment with no Microsoft app registration reports that fact directly
   * instead of failing inside MSAL and surfacing as a workbook fault.
   */
  getUnavailabilityReason(): string | null {
    if (getWorkbookGateway() === null) return NO_WORKBOOK_REASON

    if (appConfig.dataSource === 'sharepoint-excel' && !isEntraConfigured()) {
      return NO_REGISTRATION_REASON
    }

    return null
  }

  /**
   * Everything the admin screens need to explain the current data source.
   *
   * Connection failures are returned rather than thrown: "the workbook is
   * unreachable, and here is why" is the answer to this question, not an
   * error in answering it.
   */
  async getStatus(): Promise<AdminWorkbookStatus> {
    const gateway = getWorkbookGateway()

    const base = {
      sourceLabel: DATA_SOURCE_LABELS[appConfig.dataSource],
      isTemporary: TEMPORARY_SOURCES.includes(appConfig.dataSource),
    }

    if (gateway === null) {
      return {
        ...base,
        transportName: 'none',
        hasWorkbook: false,
        isConnected: false,
        canWrite: false,
        structure: null,
        error: null,
      }
    }

    const partial = {
      ...base,
      transportName: gateway.name,
      hasWorkbook: true,
      canWrite: gateway.canWrite,
    }

    // Checked before the request is attempted, because without a registration
    // there is no token to make one with, and the resulting MSAL failure would
    // read as a workbook problem rather than a configuration one.
    const unavailable = this.getUnavailabilityReason()
    if (unavailable !== null) {
      return { ...partial, isConnected: false, structure: null, error: unavailable }
    }

    try {
      await gateway.validateConnection()

      return {
        ...partial,
        isConnected: true,
        structure: await inspectAdminWorkbookStructure(gateway),
        error: null,
      }
    } catch (error) {
      return {
        ...partial,
        isConnected: false,
        structure: null,
        error: describeFailure(error),
      }
    }
  }

  /**
   * Creates whatever the workbook is missing, and reports what it did.
   *
   * The single entry point for structure repair: startup initialisation and
   * the manual check in Settings both come through here, so there is one
   * implementation and one in-flight run.
   *
   * Safe to run repeatedly — see `ensureAdminWorkbookStructure` for the
   * guarantees. Unlike `getStatus` this rejects, because the caller asked for
   * a change and needs to know it did not happen.
   */
  ensureStructure(): Promise<WorkbookStructureReport> {
    if (this.inFlight !== null) return this.inFlight

    const run = this.runEnsureStructure()
    this.inFlight = run

    // Cleared once settled so a later request re-checks the workbook rather
    // than replaying a stale result. Guarded by identity in case a retry has
    // already replaced it, and the rejection is swallowed here only so this
    // bookkeeping chain cannot raise an unhandled rejection of its own — the
    // promise handed to callers still rejects.
    void run
      .catch(() => undefined)
      .finally(() => {
        if (this.inFlight === run) this.inFlight = null
      })

    return run
  }

  private async runEnsureStructure(): Promise<WorkbookStructureReport> {
    const unavailable = this.getUnavailabilityReason()
    if (unavailable !== null) throw new DataProviderError(unavailable)

    const gateway = getWorkbookGateway()
    if (gateway === null) throw new DataProviderError(NO_WORKBOOK_REASON)

    return ensureAdminWorkbookStructure(gateway)
  }
}

/**
 * Turns a failure into something an administrator can act on.
 *
 * The data and auth layers both raise errors that already read that way — a
 * missing sign-in is the most likely cause here, and saying so is far more
 * useful than "connection failed". Anything else is replaced, because a raw
 * `TypeError: Failed to fetch` tells them nothing.
 */
function describeFailure(error: unknown): string {
  if (error instanceof DataProviderError || error instanceof AuthError) return error.message

  return 'Unable to connect to the Admin data source. Check the workbook link and your access to it.'
}

let cachedService: AdminWorkbookService | undefined

export function getAdminWorkbookService(): AdminWorkbookService {
  cachedService ??= new AdminWorkbookService()
  return cachedService
}
