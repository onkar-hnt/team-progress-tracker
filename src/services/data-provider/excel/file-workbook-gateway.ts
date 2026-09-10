import type { Workbook, Worksheet } from 'exceljs'

import { DataSourceUnavailableError, WorkbookRowNotFoundError } from '../data-provider.errors'
import type { RawExcelRow } from './excel-schema'
import { sheetNameForTable } from './excel-schema'
import { WORKBOOK_TEMPLATE, templateForSheet } from './workbook-template'
import type {
  WorkbookGateway,
  WorkbookStructure,
  WorkbookTable,
  WorkbookTableInfo,
} from './workbook-gateway'

/**
 * Reads and writes a real `.xlsx` file.
 *
 * Used against the OneDrive-synced copy of the workbook on disk, which the
 * sync client then pushes back to SharePoint. That is what makes the
 * application Excel-driven without a Microsoft app registration: the browser
 * never talks to SharePoint, it talks to a file the user chose.
 *
 * Design notes:
 *
 * - Rows are addressed by matching a key column, never by row number, so
 *   sorting or inserting rows in Excel cannot corrupt a write.
 * - The whole file is loaded, modified and written back. That preserves
 *   sheets, formatting and formulas this application knows nothing about,
 *   which matters because people edit the file by hand as well.
 * - Reads are cached for the lifetime of one operation only. Anything longer
 *   would show stale data after somebody edits the file in Excel.
 */

/** Where the bytes come from and go back to. */
export interface WorkbookFileStore {
  readonly name: string

  /** `false` when the file was opened without permission to write. */
  readonly canWrite: boolean

  read(): Promise<ArrayBuffer>

  write(data: ArrayBuffer): Promise<void>
}

/** Cell values this gateway is prepared to write. */
type WritableCell = boolean | number | string | null

/**
 * ExcelJS is loaded on demand.
 *
 * It is a large library, and only this data source needs it, so it must not
 * be in the initial bundle.
 */
async function loadExcelJs() {
  const module = await import('exceljs')
  // The package ships a CommonJS default export under some bundler configs.
  return (module as unknown as { default?: typeof module }).default ?? module
}

export class FileWorkbookGateway implements WorkbookGateway {
  readonly name = 'local-excel-file'

  private readonly store: WorkbookFileStore

  constructor(store: WorkbookFileStore) {
    this.store = store
  }

  get isConfigured(): boolean {
    return true
  }

  get canWrite(): boolean {
    return this.store.canWrite
  }

  /**
   * ExcelJS can create a table but cannot extend one when reloading a file,
   * so rows this application appended would fall outside the table range and
   * disappear from anything reading it. Structure is therefore reported and
   * never altered here; the Graph transport is what repairs it.
   */
  get canManageStructure(): boolean {
    return false
  }

  async validateConnection(): Promise<void> {
    await this.open()
  }

  /**
   * Reports each template sheet that exists, under its table name.
   *
   * This transport has only worksheets to go on, so "the table exists" means
   * "the sheet exists and has a header row". Sheets outside the template are
   * still listed, because an unexpected sheet is useful diagnostic detail.
   */
  async describeStructure(): Promise<WorkbookStructure> {
    const { workbook } = await this.open()
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name)
    const tables: WorkbookTableInfo[] = []

    for (const template of WORKBOOK_TEMPLATE) {
      const sheet = workbook.getWorksheet(template.sheetName)
      if (sheet === undefined) continue

      tables.push({
        name: template.tableName,
        sheetName: template.sheetName,
        columns: readOptionalHeader(sheet),
      })
    }

    return { sheetNames, tables }
  }

  createTable(): Promise<void> {
    return this.rejectStructureChange()
  }

  addColumns(): Promise<void> {
    return this.rejectStructureChange()
  }

  private rejectStructureChange(): Promise<never> {
    return Promise.reject(
      new DataSourceUnavailableError(
        'A workbook opened from disk cannot have sheets or columns added by the application. ' +
          'Add them in Excel, or use "Create a new one" to generate a correctly structured file.',
      ),
    )
  }

  async getTable(tableName: string): Promise<WorkbookTable> {
    const { workbook } = await this.open()
    return readSheet(workbook, sheetNameForTable(tableName))
  }

  async appendRow(tableName: string, row: RawExcelRow): Promise<void> {
    await this.appendRows(tableName, [row])
  }

  async appendRows(tableName: string, rows: readonly RawExcelRow[]): Promise<void> {
    if (rows.length === 0) return

    await this.mutate(tableName, (sheet, columns) => {
      for (const row of rows) {
        sheet.addRow(toCellArray(columns, row))
      }
    })
  }

  async updateRowByKey(
    tableName: string,
    keyColumn: string,
    keyValue: string,
    row: RawExcelRow,
  ): Promise<void> {
    let found = false

    await this.mutate(tableName, (sheet, columns) => {
      const rowNumber = findRowNumber(sheet, columns, keyColumn, keyValue)
      if (rowNumber === null) return

      found = true
      const target = sheet.getRow(rowNumber)
      toCellArray(columns, row).forEach((value, index) => {
        target.getCell(index + 1).value = value
      })
      target.commit()
    })

    if (!found) throw new WorkbookRowNotFoundError(tableName, keyColumn, keyValue)
  }

  async deleteRowByKey(tableName: string, keyColumn: string, keyValue: string): Promise<void> {
    const removed = await this.deleteRowsByKey(tableName, keyColumn, keyValue)
    if (removed === 0) throw new WorkbookRowNotFoundError(tableName, keyColumn, keyValue)
  }

  async deleteRowsByKey(
    tableName: string,
    keyColumn: string,
    keyValue: string,
  ): Promise<number> {
    let removed = 0

    await this.mutate(tableName, (sheet, columns) => {
      const keyIndex = columns.indexOf(keyColumn)
      if (keyIndex === -1) return

      const matching: number[] = []
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return
        if (cellToString(row.getCell(keyIndex + 1).value) === keyValue) matching.push(rowNumber)
      })

      // Removed from the bottom up, because splicing a row renumbers every
      // row below it and would invalidate the remaining positions.
      for (const rowNumber of [...matching].reverse()) {
        sheet.spliceRows(rowNumber, 1)
      }

      removed = matching.length
    })

    return removed
  }

  private async open(): Promise<{ workbook: Workbook }> {
    const ExcelJS = await loadExcelJs()
    const workbook = new ExcelJS.Workbook()

    try {
      await workbook.xlsx.load(await this.store.read())
    } catch (error) {
      throw new DataSourceUnavailableError(
        `The workbook "${this.store.name}" could not be read. It may be open in another program, or not be a valid .xlsx file.`,
        { cause: error },
      )
    }

    return { workbook }
  }

  /**
   * Loads the file, applies a change and writes it back.
   *
   * Read-modify-write on every operation is deliberately simple: the tables
   * are small, and it means a change somebody makes in Excel between two
   * application writes is never silently overwritten by a stale copy held in
   * memory.
   */
  private async mutate(
    tableName: string,
    apply: (sheet: Worksheet, columns: string[]) => void,
  ): Promise<void> {
    if (!this.canWrite) {
      throw new DataSourceUnavailableError(
        'The workbook was opened without permission to save changes. Reconnect it and allow editing.',
      )
    }

    const { workbook } = await this.open()
    const sheetName = sheetNameForTable(tableName)
    const sheet = requireSheet(workbook, sheetName)
    const columns = readHeader(sheet, sheetName)

    apply(sheet, columns)

    try {
      const buffer = await workbook.xlsx.writeBuffer()
      await this.store.write(buffer as ArrayBuffer)
    } catch (error) {
      throw new DataSourceUnavailableError(
        `The workbook "${this.store.name}" could not be saved. Close it in Excel if it is open, then try again.`,
        { cause: error },
      )
    }
  }
}

function requireSheet(workbook: Workbook, sheetName: string): Worksheet {
  const sheet = workbook.getWorksheet(sheetName)

  if (sheet === undefined) {
    const expected = WORKBOOK_TEMPLATE.map((template) => template.sheetName).join(', ')
    throw new DataSourceUnavailableError(
      `The workbook has no sheet named "${sheetName}". It must contain: ${expected}. ` +
        'Use "Download starter workbook" in Settings to get a correctly structured file.',
    )
  }

  return sheet
}

/**
 * Reads the header row.
 *
 * Blank trailing cells are dropped so a sheet with formatting applied beyond
 * the data does not produce a run of empty column names.
 */
function readHeader(sheet: Worksheet, sheetName: string): string[] {
  const header = sheet.getRow(1)
  const columns: string[] = []

  header.eachCell({ includeEmpty: true }, (cell) => {
    columns.push(cellToString(cell.value).trim())
  })

  while (columns.length > 0 && columns[columns.length - 1] === '') columns.pop()

  if (columns.length === 0) {
    const template = templateForSheet(sheetName)
    throw new DataSourceUnavailableError(
      `The sheet "${sheetName}" has no header row. ` +
        (template === undefined
          ? 'Add the column names to the first row.'
          : `Its first row must be: ${template.columns.join(', ')}.`),
    )
  }

  return columns
}

/**
 * The header row, or an empty list when the sheet has none.
 *
 * Unlike `readHeader` this does not throw: structure reporting exists to
 * describe a broken workbook, so a sheet with no header is an answer rather
 * than a failure.
 */
function readOptionalHeader(sheet: Worksheet): string[] {
  const columns: string[] = []

  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
    columns.push(cellToString(cell.value).trim())
  })

  while (columns.length > 0 && columns[columns.length - 1] === '') columns.pop()
  return columns
}

function readSheet(workbook: Workbook, sheetName: string): WorkbookTable {
  const sheet = requireSheet(workbook, sheetName)
  const columns = readHeader(sheet, sheetName)
  const rows: RawExcelRow[] = []

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return

    const record: RawExcelRow = {}
    let hasValue = false

    columns.forEach((column, index) => {
      const value = normaliseCell(row.getCell(index + 1).value)
      record[column] = value
      if (value !== null && value !== '') hasValue = true
    })

    // Excel files routinely carry blank rows below the data once somebody has
    // deleted content. Skipping them avoids a run of phantom records.
    if (hasValue) rows.push(record)
  })

  return { columns, rows }
}

/**
 * Reduces an ExcelJS cell to a plain value.
 *
 * ExcelJS represents rich text, formulas, hyperlinks and errors as objects.
 * The mapping layer above expects primitives, so each is reduced to the value
 * a person would see in the cell.
 */
function normaliseCell(value: unknown): boolean | number | string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value

  if (value instanceof Date) return value.toISOString()

  if (typeof value === 'object') {
    const candidate = value as {
      error?: string
      formula?: string
      hyperlink?: string
      result?: unknown
      richText?: { text: string }[]
      text?: string
    }

    // A formula cell carries its computed result, which is the value that
    // matters; an error cell has no usable value at all.
    if (candidate.error !== undefined) return null
    if (candidate.result !== undefined) return normaliseCell(candidate.result)
    if (candidate.richText !== undefined) {
      return candidate.richText.map((part) => part.text).join('')
    }
    if (candidate.text !== undefined) return candidate.text
  }

  return String(value)
}

function cellToString(value: unknown): string {
  const normalised = normaliseCell(value)
  return normalised === null ? '' : String(normalised)
}

function findRowNumber(
  sheet: Worksheet,
  columns: readonly string[],
  keyColumn: string,
  keyValue: string,
): number | null {
  const keyIndex = columns.indexOf(keyColumn)
  if (keyIndex === -1) return null

  let match: number | null = null

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || match !== null) return
    if (cellToString(row.getCell(keyIndex + 1).value) === keyValue) match = rowNumber
  })

  return match
}

/**
 * Lays a record out in the sheet's own column order.
 *
 * Columns the record does not mention are written as `null` rather than
 * skipped, so an update clears a value that was removed instead of leaving
 * the previous one in place.
 */
function toCellArray(columns: readonly string[], row: RawExcelRow): WritableCell[] {
  return columns.map((column) => {
    const value = row[column]

    if (value === undefined || value === null) return null
    if (typeof value === 'boolean' || typeof value === 'number') return value
    return String(value)
  })
}
