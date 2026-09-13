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

  get canManageStructure(): boolean {
    return false
  }

  async validateConnection(): Promise<void> {
    await this.open()
  }

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
        'Choose an empty workbook instead and the application will create the sheets itself.',
    )
  }

  return sheet
}

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

    if (hasValue) rows.push(record)
  })

  return { columns, rows }
}

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

function toCellArray(columns: readonly string[], row: RawExcelRow): WritableCell[] {
  return columns.map((column) => {
    const value = row[column]

    if (value === undefined || value === null) return null
    if (typeof value === 'boolean' || typeof value === 'number') return value
    return String(value)
  })
}
