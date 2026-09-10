import { DataSourceUnavailableError } from '../data-provider.errors'
import type { RawExcelRow } from './excel-schema'

/**
 * A table as returned by the workbook, addressed by table name.
 *
 * `columns` is the header row, kept so that missing-column checks can produce
 * a precise error instead of silently mapping every cell to `undefined`.
 */
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

/**
 * What the workbook contains right now.
 *
 * Read in one go rather than probed table by table, so deciding what is
 * missing is a comparison against a snapshot instead of a sequence of
 * requests that could each see a different state of the file.
 */
export interface WorkbookStructure {
  sheetNames: string[]
  tables: WorkbookTableInfo[]
}

export interface CreateWorkbookTableRequest {
  sheetName: string
  tableName: string
  columns: readonly string[]
}

/**
 * Transport for reading and writing Excel tables.
 *
 * This is deliberately the narrowest possible surface: named tables in, rows
 * out. Authentication, HTTP, retries, throttling and the Microsoft Graph
 * workbook-session lifecycle are all implementation concerns that live below
 * this interface and never leak above it.
 *
 * Implementations must honour two rules that keep the data model stable:
 *
 * 1. Address rows by key column, never by position. The Graph table-row API
 *    is index-based, so an implementation has to look the index up by
 *    matching `keyValue` at call time. Indexes must never be cached or
 *    persisted, because any concurrent edit or sort invalidates them.
 * 2. Read whole tables, never fixed cell ranges, so that inserting a column
 *    or reordering rows in Excel cannot corrupt a read.
 */
export interface WorkbookGateway {
  readonly name: string

  /** `false` until credentials and workbook location are supplied. */
  readonly isConfigured: boolean

  /** `false` when the integration is scoped to read-only access. */
  readonly canWrite: boolean

  /**
   * Whether sheets and tables can be created, as opposed to only rows.
   *
   * Separate from `canWrite` because the two are genuinely independent: the
   * file transport can write rows all day but cannot maintain an Excel table
   * range, so it reports the structure it finds and refuses to change it.
   */
  readonly canManageStructure: boolean

  /**
   * Confirms the workbook is reachable and readable, without reading data.
   *
   * Exists so a connection problem can be reported as one, rather than
   * surfacing as every table on every screen failing separately.
   */
  validateConnection(): Promise<void>

  /** The sheets and tables that exist, for comparison against the template. */
  describeStructure(): Promise<WorkbookStructure>

  /**
   * Creates a table, and the sheet holding it if that is missing too.
   *
   * Must reject rather than overwrite when the table already exists, so that
   * callers cannot destroy data by running structure repair twice.
   */
  createTable(request: CreateWorkbookTableRequest): Promise<void>

  /**
   * Appends columns to an existing table, leaving current columns in place.
   *
   * Repairs a table that predates a new column. Existing rows get a blank
   * cell in the new column, which is what a mapper treats as absent.
   */
  addColumns(tableName: string, columns: readonly string[]): Promise<void>

  getTable(tableName: string): Promise<WorkbookTable>

  /** Appends a row to the end of the named table. */
  appendRow(tableName: string, row: RawExcelRow): Promise<void>

  /**
   * Appends several rows in one call.
   *
   * Provided separately because rewriting a mentor's assignments means adding
   * a handful of rows at once, and one request per row would be both slow and
   * partially applicable if it failed halfway.
   */
  appendRows(tableName: string, rows: readonly RawExcelRow[]): Promise<void>

  /**
   * Replaces the row whose `keyColumn` equals `keyValue`.
   *
   * Must reject when no row matches, so callers can surface a clear
   * "record no longer exists" message.
   */
  updateRowByKey(
    tableName: string,
    keyColumn: string,
    keyValue: string,
    row: RawExcelRow,
  ): Promise<void>

  deleteRowByKey(tableName: string, keyColumn: string, keyValue: string): Promise<void>

  /**
   * Deletes every row whose `keyColumn` equals `keyValue`, returning the count.
   *
   * Needed for tables with no single-column key, such as the mentor mapping,
   * where "all rows for this mentor" is the unit of work. Unlike
   * `deleteRowByKey` this succeeds when nothing matches, because removing an
   * empty set is not an error.
   */
  deleteRowsByKey(tableName: string, keyColumn: string, keyValue: string): Promise<number>
}

/**
 * Placeholder gateway used until the SharePoint integration is built.
 *
 * It exists so the Excel provider can be constructed, unit tested and wired
 * into configuration today, and so that selecting the Excel data source
 * without credentials fails with an explanatory message rather than a crash.
 */
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
