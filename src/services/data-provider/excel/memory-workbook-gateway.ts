import { DataSourceUnavailableError, WorkbookRowNotFoundError } from '../data-provider.errors'
import type { RawExcelRow } from './excel-schema'
import { WORKBOOK_TEMPLATE } from './workbook-template'
import type {
  CreateWorkbookTableRequest,
  WorkbookGateway,
  WorkbookStructure,
  WorkbookTable,
  WorkbookTableInfo,
} from './workbook-gateway'

interface MemoryTable {
  sheetName: string
  columns: string[]
  rows: RawExcelRow[]
}

/** Cell values a workbook can hold, matching what the Graph gateway writes. */
type MemoryCell = boolean | number | string

export class MemoryWorkbookGateway implements WorkbookGateway {
  readonly name = 'in-memory-workbook'
  readonly isConfigured = true
  readonly canWrite = true
  readonly canManageStructure = true

  private readonly tables = new Map<string, MemoryTable>()
  private readonly sheetNames = new Set<string>()

  constructor() {
    for (const template of WORKBOOK_TEMPLATE) {
      this.sheetNames.add(template.sheetName)
      this.tables.set(template.tableName, {
        sheetName: template.sheetName,
        columns: [...template.columns],
        rows: [],
      })
    }
  }

  validateConnection(): Promise<void> {
    return Promise.resolve()
  }

  describeStructure(): Promise<WorkbookStructure> {
    const tables: WorkbookTableInfo[] = [...this.tables.entries()].map(([name, table]) => ({
      name,
      sheetName: table.sheetName,
      columns: [...table.columns],
    }))

    return Promise.resolve({ sheetNames: [...this.sheetNames], tables })
  }

  createTable({ columns, sheetName, tableName }: CreateWorkbookTableRequest): Promise<void> {
    if (this.tables.has(tableName)) {
      return Promise.reject(
        new DataSourceUnavailableError(
          `Excel table "${tableName}" already exists, so it was not recreated.`,
        ),
      )
    }

    this.sheetNames.add(sheetName)
    this.tables.set(tableName, { sheetName, columns: [...columns], rows: [] })
    return Promise.resolve()
  }

  addColumns(tableName: string, columns: readonly string[]): Promise<void> {
    const table = this.requireTable(tableName)

    for (const column of columns) {
      if (table.columns.includes(column)) continue

      table.columns.push(column)
      // Existing rows gain a blank cell, which the mappers read as absent.
      for (const row of table.rows) row[column] = ''
    }

    return Promise.resolve()
  }

  getTable(tableName: string): Promise<WorkbookTable> {
    const table = this.requireTable(tableName)

    return Promise.resolve({
      columns: [...table.columns],
      rows: table.rows.map((row) => ({ ...row })),
    })
  }

  appendRow(tableName: string, row: RawExcelRow): Promise<void> {
    return this.appendRows(tableName, [row])
  }

  appendRows(tableName: string, rows: readonly RawExcelRow[]): Promise<void> {
    if (rows.length === 0) return Promise.resolve()

    const table = this.requireTable(tableName)
    for (const row of rows) table.rows.push(toStoredRow(table.columns, row))

    return Promise.resolve()
  }

  updateRowByKey(
    tableName: string,
    keyColumn: string,
    keyValue: string,
    row: RawExcelRow,
  ): Promise<void> {
    const table = this.requireTable(tableName)
    const index = table.rows.findIndex((candidate) => cellText(candidate[keyColumn]) === keyValue)

    if (index === -1) {
      return Promise.reject(new WorkbookRowNotFoundError(tableName, keyColumn, keyValue))
    }

    table.rows[index] = toStoredRow(table.columns, row)
    return Promise.resolve()
  }

  async deleteRowByKey(
    tableName: string,
    keyColumn: string,
    keyValue: string,
  ): Promise<void> {
    const removed = await this.deleteRowsByKey(tableName, keyColumn, keyValue)
    if (removed === 0) throw new WorkbookRowNotFoundError(tableName, keyColumn, keyValue)
  }

  deleteRowsByKey(tableName: string, keyColumn: string, keyValue: string): Promise<number> {
    const table = this.requireTable(tableName)
    const remaining = table.rows.filter(
      (candidate) => cellText(candidate[keyColumn]) !== keyValue,
    )

    const removed = table.rows.length - remaining.length
    table.rows = remaining
    return Promise.resolve(removed)
  }

  /** Mirrors Graph, where addressing an absent table is a request failure. */
  private requireTable(tableName: string): MemoryTable {
    const table = this.tables.get(tableName)

    if (table === undefined) {
      throw new DataSourceUnavailableError(
        `The in-memory workbook has no table named "${tableName}".`,
      )
    }

    return table
  }
}

function toStoredRow(columns: readonly string[], row: RawExcelRow): RawExcelRow {
  const stored: RawExcelRow = {}

  for (const column of columns) {
    stored[column] = toCell(row[column])
  }

  return stored
}

function toCell(value: unknown): MemoryCell {
  if (value === undefined || value === null) return ''
  if (typeof value === 'boolean' || typeof value === 'number') return value
  return String(value)
}

function cellText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

let cachedGateway: MemoryWorkbookGateway | undefined

export function getMemoryWorkbookGateway(): MemoryWorkbookGateway {
  cachedGateway ??= new MemoryWorkbookGateway()
  return cachedGateway
}
