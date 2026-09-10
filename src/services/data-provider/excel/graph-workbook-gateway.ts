import { DataSourceUnavailableError, WorkbookRowNotFoundError } from '../data-provider.errors'
import type { RawExcelRow } from './excel-schema'
import type {
  CreateWorkbookTableRequest,
  WorkbookGateway,
  WorkbookStructure,
  WorkbookTable,
} from './workbook-gateway'

/**
 * Reads and writes the workbook through the Microsoft Graph workbook API.
 *
 * Notes on the shape of this integration:
 *
 * - Tables are addressed by *name*, and rows come back as arrays of cell
 *   values plus a separate header row. Column order is therefore resolved at
 *   read time rather than assumed, so inserting a column in Excel cannot
 *   silently shift every value by one.
 * - The row APIs are index-based. Indexes are looked up by matching the key
 *   column immediately before each write and never cached, because any
 *   concurrent edit, sort or filter invalidates them.
 * - Writes go through a persisted workbook session so that several row
 *   operations apply to the same view of the file, rather than each request
 *   racing the others.
 */

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'

/** Cell values Graph accepts. Everything is normalised to one of these. */
type GraphCell = boolean | number | string

interface GraphTableRow {
  index: number
  values: GraphCell[][]
}

interface GraphRange {
  values: GraphCell[][]
}

interface GraphCollection<TValue> {
  value: TValue[]
}

interface GraphNamed {
  name: string
}

interface GraphNamedWithId extends GraphNamed {
  id: string
}

interface GraphTable extends GraphNamedWithId {
  worksheet?: GraphNamed
}

export interface GraphWorkbookGatewayOptions {
  /**
   * Sharing URL of the workbook, as copied from OneDrive or SharePoint.
   *
   * Graph can resolve a shared file straight from its sharing URL, which
   * avoids having to discover and store a drive id and item id up front.
   */
  workbookUrl: string

  /** Supplies a Graph access token, refreshing it as needed. */
  getAccessToken: () => Promise<string>

  /** `true` to scope the integration to reads only. */
  readOnly?: boolean
}

export class GraphWorkbookGateway implements WorkbookGateway {
  readonly name = 'microsoft-graph'

  private readonly workbookUrl: string
  private readonly getAccessToken: () => Promise<string>
  private readonly readOnly: boolean

  private itemPathPromise: Promise<string> | undefined
  private sessionId: string | undefined

  constructor(options: GraphWorkbookGatewayOptions) {
    this.workbookUrl = options.workbookUrl
    this.getAccessToken = options.getAccessToken
    this.readOnly = options.readOnly ?? false
  }

  get isConfigured(): boolean {
    return this.workbookUrl !== ''
  }

  get canWrite(): boolean {
    return this.isConfigured && !this.readOnly
  }

  /**
   * Graph is the only transport that can maintain an Excel table range, which
   * is why structure repair is offered here and nowhere else.
   */
  get canManageStructure(): boolean {
    return this.canWrite
  }

  /**
   * Resolves the sharing link and reads the workbook's sheet list.
   *
   * Deliberately does not open a write session: this runs to find out whether
   * the workbook is reachable at all, and creating a session first would make
   * a permissions problem look like a session problem.
   */
  async validateConnection(): Promise<void> {
    const base = await this.resolveItemPath()
    await this.fetchGraph<GraphCollection<GraphNamed>>(`${base}/worksheets?$select=name`, {
      method: 'GET',
    })
  }

  async describeStructure(): Promise<WorkbookStructure> {
    const base = await this.resolveItemPath()

    const [sheets, tables] = await Promise.all([
      this.fetchGraph<GraphCollection<GraphNamed>>(`${base}/worksheets?$select=name`, {
        method: 'GET',
      }),
      this.fetchGraph<GraphCollection<GraphTable>>(
        `${base}/tables?$select=id,name&$expand=worksheet($select=name)`,
        { method: 'GET' },
      ),
    ])

    // One request per table, but only ever a handful, and only when structure
    // is being checked rather than on the data path.
    const withColumns = await Promise.all(
      tables.value.map(async (table) => ({
        name: table.name,
        sheetName: table.worksheet?.name ?? '',
        columns: await this.readTableColumns(base, table.name),
      })),
    )

    return {
      sheetNames: sheets.value.map((sheet) => sheet.name),
      tables: withColumns,
    }
  }

  async createTable({
    columns,
    sheetName,
    tableName,
  }: CreateWorkbookTableRequest): Promise<void> {
    this.assertCanManageStructure()
    if (columns.length === 0) {
      throw new DataSourceUnavailableError(
        `Table "${tableName}" cannot be created with no columns.`,
      )
    }

    const structure = await this.describeStructure()

    if (structure.tables.some((table) => table.name === tableName)) {
      throw new DataSourceUnavailableError(
        `Excel table "${tableName}" already exists, so it was not recreated.`,
      )
    }

    if (!structure.sheetNames.includes(sheetName)) {
      await this.request(`/worksheets/add`, {
        method: 'POST',
        body: JSON.stringify({ name: sheetName }),
      })
    }

    // The header is written before the table is defined, because a table
    // created with `hasHeaders` takes its column names from the cells it is
    // given rather than from a separate call.
    const headerAddress = `A1:${columnAddress(columns.length - 1)}1`

    await this.request(
      `/worksheets('${encodeTableName(sheetName)}')/range(address='${headerAddress}')`,
      { method: 'PATCH', body: JSON.stringify({ values: [[...columns]] }) },
    )

    const created = await this.request<GraphNamedWithId>(`/tables/add`, {
      method: 'POST',
      body: JSON.stringify({
        address: `'${sheetName.replace(/'/g, "''")}'!${headerAddress}`,
        hasHeaders: true,
      }),
    })

    // Graph names a new table `Table1`, `Table2` and so on. The application
    // addresses tables by name, so it is renamed to the agreed one — by id,
    // since the generated name is the only handle that exists until then.
    if (created.name !== tableName) {
      await this.request(`/tables('${encodeTableName(created.id)}')`, {
        method: 'PATCH',
        body: JSON.stringify({ name: tableName }),
      })
    }
  }

  async addColumns(tableName: string, columns: readonly string[]): Promise<void> {
    this.assertCanManageStructure()

    // Appended one at a time: Graph adds a single column per call, and doing
    // them in sequence means a failure halfway leaves the earlier ones added
    // rather than the table in an unknown state.
    for (const column of columns) {
      await this.request(`/tables('${encodeTableName(tableName)}')/columns/add`, {
        method: 'POST',
        body: JSON.stringify({ name: column }),
      })
    }
  }

  async getTable(tableName: string): Promise<WorkbookTable> {
    // The header is fetched alongside the rows because Graph returns row
    // values as bare arrays; without the header there is no way to know which
    // column a cell belongs to.
    const [header, rows] = await Promise.all([
      this.request<GraphRange>(`/tables('${encodeTableName(tableName)}')/headerRowRange`, {
        method: 'GET',
      }),
      this.request<GraphCollection<GraphTableRow>>(
        `/tables('${encodeTableName(tableName)}')/rows`,
        { method: 'GET' },
      ),
    ])

    const columns = (header.values[0] ?? []).map((value) => String(value))

    return {
      columns,
      rows: rows.value.map((row) => toRawRow(columns, row.values[0] ?? [])),
    }
  }

  async appendRow(tableName: string, row: RawExcelRow): Promise<void> {
    await this.appendRows(tableName, [row])
  }

  async appendRows(tableName: string, rows: readonly RawExcelRow[]): Promise<void> {
    if (rows.length === 0) return

    const columns = (await this.getTable(tableName)).columns

    await this.request(`/tables('${encodeTableName(tableName)}')/rows/add`, {
      method: 'POST',
      body: JSON.stringify({ values: rows.map((row) => toCellArray(columns, row)) }),
    })
  }

  async updateRowByKey(
    tableName: string,
    keyColumn: string,
    keyValue: string,
    row: RawExcelRow,
  ): Promise<void> {
    const { columns, index } = await this.findRowIndex(tableName, keyColumn, keyValue)
    if (index === null) throw new WorkbookRowNotFoundError(tableName, keyColumn, keyValue)

    await this.request(
      `/tables('${encodeTableName(tableName)}')/rows/itemAt(index=${String(index)})`,
      { method: 'PATCH', body: JSON.stringify({ values: [toCellArray(columns, row)] }) },
    )
  }

  async deleteRowByKey(tableName: string, keyColumn: string, keyValue: string): Promise<void> {
    const { index } = await this.findRowIndex(tableName, keyColumn, keyValue)
    if (index === null) throw new WorkbookRowNotFoundError(tableName, keyColumn, keyValue)

    await this.request(
      `/tables('${encodeTableName(tableName)}')/rows/itemAt(index=${String(index)})`,
      { method: 'DELETE' },
    )
  }

  async deleteRowsByKey(
    tableName: string,
    keyColumn: string,
    keyValue: string,
  ): Promise<number> {
    const table = await this.getTable(tableName)
    const matching = table.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => String(row[keyColumn] ?? '') === keyValue)

    // Deleted highest-index-first, because removing a row shifts every row
    // below it up by one and would otherwise invalidate the later indexes.
    for (const { index } of [...matching].reverse()) {
      await this.request(
        `/tables('${encodeTableName(tableName)}')/rows/itemAt(index=${String(index)})`,
        { method: 'DELETE' },
      )
    }

    return matching.length
  }

  private async readTableColumns(base: string, tableName: string): Promise<string[]> {
    const columns = await this.fetchGraph<GraphCollection<GraphNamed>>(
      `${base}/tables('${encodeTableName(tableName)}')/columns?$select=name`,
      { method: 'GET' },
    )

    return columns.value.map((column) => column.name)
  }

  private assertCanManageStructure(): void {
    if (this.canManageStructure) return

    throw new DataSourceUnavailableError(
      'The workbook is connected read-only, so its sheets and tables cannot be created or repaired.',
    )
  }

  /**
   * Resolves the current position of a row from its key column.
   *
   * Reads the whole table rather than using a Graph filter because the
   * workbook row API has no server-side predicate, and the tables here are
   * small enough that one read is cheaper than the alternatives.
   */
  private async findRowIndex(
    tableName: string,
    keyColumn: string,
    keyValue: string,
  ): Promise<{ columns: string[]; index: number | null }> {
    const table = await this.getTable(tableName)
    const index = table.rows.findIndex((row) => String(row[keyColumn] ?? '') === keyValue)

    return { columns: table.columns, index: index === -1 ? null : index }
  }

  /**
   * Resolves the sharing URL to an addressable drive item, once.
   *
   * Graph accepts a base64url-encoded sharing URL on the `/shares` endpoint,
   * which returns the underlying item regardless of whether the file lives on
   * a personal OneDrive or a team site.
   */
  private async resolveItemPath(): Promise<string> {
    if (!this.isConfigured) {
      throw new DataSourceUnavailableError(
        'No workbook URL is configured. Set VITE_SHAREPOINT_WORKBOOK_URL, or switch the data source to "mock".',
      )
    }

    this.itemPathPromise ??= (async () => {
      const shareId = encodeSharingUrl(this.workbookUrl)
      const item = await this.fetchGraph<{ id: string; parentReference?: { driveId?: string } }>(
        `${GRAPH_ROOT}/shares/${shareId}/driveItem`,
        { method: 'GET' },
      )

      const driveId = item.parentReference?.driveId
      if (driveId === undefined) {
        throw new DataSourceUnavailableError(
          'The workbook link resolved to an item with no drive reference, so it cannot be opened.',
        )
      }

      return `${GRAPH_ROOT}/drives/${driveId}/items/${item.id}/workbook`
    })()

    return this.itemPathPromise
  }

  /**
   * Opens a persisted workbook session.
   *
   * Persisted rather than non-persisted because changes must survive the
   * request that made them. Graph expires sessions on its own schedule, so a
   * rejected session id is recovered from by opening a new one.
   */
  private async ensureSession(): Promise<string | undefined> {
    if (this.readOnly) return undefined
    if (this.sessionId !== undefined) return this.sessionId

    const base = await this.resolveItemPath()
    const session = await this.fetchGraph<{ id: string }>(`${base}/createSession`, {
      method: 'POST',
      body: JSON.stringify({ persistChanges: true }),
    })

    this.sessionId = session.id
    return this.sessionId
  }

  private async request<TValue>(path: string, init: RequestInit): Promise<TValue> {
    const base = await this.resolveItemPath()
    const sessionId = await this.ensureSession()

    try {
      return await this.fetchGraph<TValue>(`${base}${path}`, init, sessionId)
    } catch (error) {
      if (!(error instanceof GraphRequestError) || error.status !== 404) throw error

      // A 404 on a table means either a missing table or an expired session.
      // Retrying once without the stale session distinguishes the two: a
      // genuinely missing table fails again and surfaces properly.
      this.sessionId = undefined
      const retrySessionId = await this.ensureSession()
      return this.fetchGraph<TValue>(`${base}${path}`, init, retrySessionId)
    }
  }

  private async fetchGraph<TValue>(
    url: string,
    init: RequestInit,
    sessionId?: string,
  ): Promise<TValue> {
    const token = await this.getAccessToken()

    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(sessionId === undefined ? {} : { 'workbook-session-id': sessionId }),
      },
    })

    if (!response.ok) {
      throw new GraphRequestError(response.status, await readErrorMessage(response))
    }

    if (response.status === 204) return undefined as TValue
    return (await response.json()) as TValue
  }
}

/** Carries the HTTP status so retry logic can distinguish causes. */
class GraphRequestError extends DataSourceUnavailableError {
  readonly status: number

  constructor(status: number, message: string) {
    super(`Microsoft Graph returned ${String(status)}: ${message}`)
    this.name = 'GraphRequestError'
    this.status = status
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

/**
 * Encodes a sharing URL for the `/shares` endpoint.
 *
 * Graph's documented format: base64, made URL-safe, padding stripped, and
 * prefixed with `u!`.
 */
function encodeSharingUrl(url: string): string {
  const base64 = btoa(url)
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `u!${base64}`
}

/** Table names appear inside a quoted OData segment, so quotes are doubled. */
function encodeTableName(tableName: string): string {
  return encodeURIComponent(tableName.replace(/'/g, "''"))
}

/**
 * The Excel column letter for a zero-based index: 0 is `A`, 26 is `AA`.
 *
 * Needed because a table is defined by a range address, and the address has
 * to span exactly as many columns as the template has.
 */
function columnAddress(index: number): string {
  let remaining = index
  let address = ''

  do {
    address = String.fromCharCode(65 + (remaining % 26)) + address
    remaining = Math.floor(remaining / 26) - 1
  } while (remaining >= 0)

  return address
}

function toRawRow(columns: readonly string[], values: readonly GraphCell[]): RawExcelRow {
  const row: RawExcelRow = {}

  columns.forEach((column, index) => {
    row[column] = values[index] ?? null
  })

  return row
}

/**
 * Lays a row out in the table's own column order.
 *
 * Columns present in the table but absent from the record are written as an
 * empty string rather than skipped, because Graph expects one value per
 * column and a short array would shift the remaining cells.
 */
function toCellArray(columns: readonly string[], row: RawExcelRow): GraphCell[] {
  return columns.map((column) => {
    const value = row[column]

    if (value === undefined || value === null) return ''
    if (typeof value === 'boolean' || typeof value === 'number') return value
    return String(value)
  })
}
