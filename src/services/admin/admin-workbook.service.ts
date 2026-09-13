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
  private inFlight: Promise<WorkbookStructureReport> | null = null

  getUnavailabilityReason(): string | null {
    if (getWorkbookGateway() === null) return NO_WORKBOOK_REASON

    if (appConfig.dataSource === 'sharepoint-excel' && !isEntraConfigured()) {
      return NO_REGISTRATION_REASON
    }

    return null
  }

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

  ensureStructure(): Promise<WorkbookStructureReport> {
    if (this.inFlight !== null) return this.inFlight

    const run = this.runEnsureStructure()
    this.inFlight = run

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

function describeFailure(error: unknown): string {
  if (error instanceof DataProviderError || error instanceof AuthError) return error.message

  return 'Unable to connect to the Admin data source. Check the workbook link and your access to it.'
}

let cachedService: AdminWorkbookService | undefined

export function getAdminWorkbookService(): AdminWorkbookService {
  cachedService ??= new AdminWorkbookService()
  return cachedService
}
