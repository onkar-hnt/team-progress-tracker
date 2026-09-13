import { DataSourceUnavailableError } from '../data-provider.errors'
import type { RawExcelRow } from './excel-schema'

export interface WorkbookTable {
  columns: string[]
  rows: RawExcelRow[]
}

/** One table as it currently exists in the workbook. */
export interface WorkbookTableInfo {
  name: string

  /** The worksheet holding it. Empty when the transport cannot report it. */
  sheetName: string

  /** Header row, in workbook order. */
  columns: string[]
}

export interface WorkbookStructure {
  sheetNames: string[]
  tables: WorkbookTableInfo[]
}

export interface CreateWorkbookTableRequest {
  sheetName: string
  tableName: string
  columns: readonly string[]
}

export interface WorkbookGateway {
  readonly name: string

  /** `false` until credentials and workbook location are supplied. */
  readonly isConfigured: boolean

  /** `false` when the integration is scoped to read-only access. */
  readonly canWrite: boolean

  readonly canManageStructure: boolean

  validateConnection(): Promise<void>

  /** The sheets and tables that exist, for comparison against the template. */
  describeStructure(): Promise<WorkbookStructure>

  createTable(request: CreateWorkbookTableRequest): Promise<void>

  addColumns(tableName: string, columns: readonly string[]): Promise<void>

  getTable(tableName: string): Promise<WorkbookTable>

  /** Appends a row to the end of the named table. */
  appendRow(tableName: string, row: RawExcelRow): Promise<void>

  appendRows(tableName: string, rows: readonly RawExcelRow[]): Promise<void>

  updateRowByKey(
    tableName: string,
    keyColumn: string,
    keyValue: string,
    row: RawExcelRow,
  ): Promise<void>

  deleteRowByKey(tableName: string, keyColumn: string, keyValue: string): Promise<void>

  deleteRowsByKey(tableName: string, keyColumn: string, keyValue: string): Promise<number>
}

export class UnconfiguredWorkbookGateway implements WorkbookGateway {
  readonly name = 'unconfigured-workbook'
  readonly isConfigured = false
  readonly canWrite = false
  readonly canManageStructure = false

  private fail(): never {
    throw new DataSourceUnavailableError(
      'Unable to connect to the Admin data source. ' +
        'No workbook is configured yet: supply the Microsoft app registration, or set the data source to "memory-excel" to work offline.',
    )
  }

  validateConnection(): Promise<void> {
    return this.fail()
  }

  describeStructure(): Promise<WorkbookStructure> {
    return this.fail()
  }

  createTable(): Promise<void> {
    return this.fail()
  }

  addColumns(): Promise<void> {
    return this.fail()
  }

  getTable(): Promise<WorkbookTable> {
    return this.fail()
  }

  appendRow(): Promise<void> {
    return this.fail()
  }

  appendRows(): Promise<void> {
    return this.fail()
  }

  updateRowByKey(): Promise<void> {
    return this.fail()
  }

  deleteRowByKey(): Promise<void> {
    return this.fail()
  }

  deleteRowsByKey(): Promise<number> {
    return this.fail()
  }
}
