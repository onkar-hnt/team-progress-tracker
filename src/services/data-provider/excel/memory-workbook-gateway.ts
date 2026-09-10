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

/**
 * TEMPORARY: a workbook held in memory, for development only.
 *
 * TODO(sharepoint-excel): delete this gateway once the Microsoft Entra app
 * registration exists. It is not a database and makes no attempt to be one —
 * every row is lost when the tab reloads.
 *
 * It exists because a browser cannot read the SharePoint workbook without a
 * Graph token, and the registration that issues one is not available yet.
 * Rather than stub out the Admin screens, this stands in at the transport
 * boundary: the tables, column names, row mapping, validation, referential
 * integrity and structure checks above it are all the real implementations,
 * running against the real schema. Swapping it for `GraphWorkbookGateway` is
 * therefore a configuration change, and any schema mistake surfaces here
 * rather than on the day of integration.
 *
 * Its semantics deliberately copy the Graph transport rather than being
 * convenient: tables are addressed by name, a missing table is an error, rows
 * are stored in column order, and absent values become empty cells.
 */

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

  /**
   * Starts as a correctly structured but empty workbook.
   *
   * Seeded from the same template that builds a real starter file, so the
   * application opens onto empty states rather than onto "table not found" on
   * every screen. No records are seeded: business data belongs in the
   * workbook, never in the codebase.
   */
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

/**
 * Lays a record out in the table's own column order.
 *
 * Columns the record does not mention are stored as an empty string rather
 * than omitted, so a cleared value reads back as blank instead of keeping the
 * value it had — the same rule the Graph transport follows.
 */
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

/**
 * Shared instance, so writes are visible across screens.
 *
 * The data provider is rebuilt whenever the workbook connection changes, and
 * a new gateway each time would silently discard everything saved so far.
 */
export function getMemoryWorkbookGateway(): MemoryWorkbookGateway {
  cachedGateway ??= new MemoryWorkbookGateway()
  return cachedGateway
}
