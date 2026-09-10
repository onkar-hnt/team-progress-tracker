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

  private fail(): never {
    throw new DataSourceUnavailableError(
      'The SharePoint Excel integration is not configured yet. ' +
        'Set the data source to "mock", or supply workbook credentials and register a real WorkbookGateway.',
    )
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
