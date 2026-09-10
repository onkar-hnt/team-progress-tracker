import type {
  CreateDailyWorkEntryRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  Developer,
  Project,
  UpdateDailyWorkEntryRequest,
} from '@models/index'

import { createDailyWorkEntryId, filterDailyWorkEntries } from '../daily-work-query'
import type { DataProvider, DataProviderCapabilities } from '../data-provider.interface'
import {
  DuplicateRecordError,
  ReadOnlyDataSourceError,
  RecordNotFoundError,
  ReferentialIntegrityError,
  RowValidationError,
  SchemaMismatchError,
} from '../data-provider.errors'
import type { DataSourceTable, RowValidationIssue } from '../data-provider.errors'
import { dailyWorkEntrySchema, describeZodIssues } from './excel-row.schemas'
import {
  findDuplicateIds,
  mapDailyWorkRow,
  mapDeveloperRow,
  mapProjectRow,
  mapTableRows,
  toDailyWorkRow,
} from './excel-mappers'
import {
  DAILY_WORK_COLUMNS,
  DEVELOPER_COLUMNS,
  EXCEL_TABLES,
  PROJECT_COLUMNS,
  REQUIRED_DAILY_WORK_COLUMNS,
  REQUIRED_DEVELOPER_COLUMNS,
  REQUIRED_PROJECT_COLUMNS,
} from './excel-schema'
import { parseExcelTextCell } from './excel-value.utils'
import type { WorkbookGateway, WorkbookTable } from './workbook-gateway'

export interface ExcelDataProviderOptions {
  gateway: WorkbookGateway

  /**
   * When `true`, any invalid row fails the whole read.
   *
   * The default tolerates bad rows so that one mistyped cell cannot blank out
   * the dashboard for everybody. Turn it on for import validation tooling.
   */
  strictRowValidation?: boolean

  /** Receives rows that were skipped, for logging or an admin warning banner. */
  onRowValidationIssues?: (table: DataSourceTable, issues: readonly RowValidationIssue[]) => void
}

/**
 * Reads and writes the team workbook through a `WorkbookGateway`.
 *
 * All Excel knowledge in the application ends here. The provider owns schema
 * checking, row mapping, id assignment and referential integrity, so that
 * swapping the gateway for a Graph implementation requires no changes to this
 * file, and swapping this provider for a REST one requires no changes above it.
 */
export class ExcelDataProvider implements DataProvider {
  readonly name = 'sharepoint-excel'

  private readonly gateway: WorkbookGateway
  private readonly strictRowValidation: boolean
  private readonly onRowValidationIssues:
    | ((table: DataSourceTable, issues: readonly RowValidationIssue[]) => void)
    | undefined

  constructor(options: ExcelDataProviderOptions) {
    this.gateway = options.gateway
    this.strictRowValidation = options.strictRowValidation ?? false
    this.onRowValidationIssues = options.onRowValidationIssues
  }

  get capabilities(): DataProviderCapabilities {
    return { canWrite: this.gateway.canWrite }
  }

  async getDevelopers(): Promise<Developer[]> {
    const table = await this.readTable(
      EXCEL_TABLES.developers,
      'Developers',
      REQUIRED_DEVELOPER_COLUMNS,
    )

    const mapped = mapTableRows(table.rows, mapDeveloperRow, (row) =>
      parseExcelTextCell(row[DEVELOPER_COLUMNS.developerId]) ?? undefined,
    )

    this.reportIssues('Developers', mapped.issues)
    this.assertUniqueIds(
      'Developers',
      mapped.records.map((developer) => developer.id),
    )

    return mapped.records
  }

  async getProjects(): Promise<Project[]> {
    const table = await this.readTable(EXCEL_TABLES.projects, 'Projects', REQUIRED_PROJECT_COLUMNS)

    const mapped = mapTableRows(table.rows, mapProjectRow, (row) =>
      parseExcelTextCell(row[PROJECT_COLUMNS.projectId]) ?? undefined,
    )

    this.reportIssues('Projects', mapped.issues)
    this.assertUniqueIds(
      'Projects',
      mapped.records.map((project) => project.id),
    )

    return mapped.records
  }

  async getDailyWorkEntries(query?: DailyWorkQuery): Promise<DailyWorkEntry[]> {
    const entries = await this.readAllDailyWork()
    return filterDailyWorkEntries(entries, query)
  }

  async getDailyWorkEntryById(id: string): Promise<DailyWorkEntry | null> {
    const entries = await this.readAllDailyWork()
    return entries.find((entry) => entry.id === id) ?? null
  }

  async createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry> {
    this.assertWritable()
    await this.assertReferencesExist(request.developerId, request.projectId)

    const now = new Date().toISOString()
    const entry = this.validateEntry({
      ...request,
      id: createDailyWorkEntryId(),
      createdAt: now,
      updatedAt: now,
    })

    await this.gateway.appendRow(EXCEL_TABLES.dailyWork, toDailyWorkRow(entry))
    return entry
  }

  async updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry> {
    this.assertWritable()

    const existing = await this.getDailyWorkEntryById(id)
    if (existing === null) throw new RecordNotFoundError('DailyWork', id)

    await this.assertReferencesExist(
      request.developerId ?? existing.developerId,
      request.projectId ?? existing.projectId,
    )

    const entry = this.validateEntry({
      ...existing,
      ...request,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    })

    await this.gateway.updateRowByKey(
      EXCEL_TABLES.dailyWork,
      DAILY_WORK_COLUMNS.entryId,
      id,
      toDailyWorkRow(entry),
    )

    return entry
  }

  async deleteDailyWorkEntry(id: string): Promise<void> {
    this.assertWritable()
    await this.gateway.deleteRowByKey(EXCEL_TABLES.dailyWork, DAILY_WORK_COLUMNS.entryId, id)
  }

  private async readAllDailyWork(): Promise<DailyWorkEntry[]> {
    const table = await this.readTable(
      EXCEL_TABLES.dailyWork,
      'DailyWork',
      REQUIRED_DAILY_WORK_COLUMNS,
    )

    const mapped = mapTableRows(table.rows, mapDailyWorkRow, (row) =>
      parseExcelTextCell(row[DAILY_WORK_COLUMNS.entryId]) ?? undefined,
    )

    this.reportIssues('DailyWork', mapped.issues)
    this.assertUniqueIds(
      'DailyWork',
      mapped.records.map((entry) => entry.id),
    )

    return mapped.records
  }

  private async readTable(
    tableName: string,
    table: DataSourceTable,
    requiredColumns: readonly string[],
  ): Promise<WorkbookTable> {
    const workbookTable = await this.gateway.getTable(tableName)

    const present = new Set(workbookTable.columns)
    const missing = requiredColumns.filter((column) => !present.has(column))
    if (missing.length > 0) throw new SchemaMismatchError(table, missing)

    return workbookTable
  }

  private validateEntry(candidate: DailyWorkEntry): DailyWorkEntry {
    const result = dailyWorkEntrySchema.safeParse(candidate)
    if (!result.success) {
      throw new RowValidationError('DailyWork', [
        { index: 0, recordId: candidate.id, messages: describeZodIssues(result.error) },
      ])
    }

    return result.data
  }

  /**
   * Enforces the workbook's foreign keys.
   *
   * Excel cannot do this itself, so it is checked before every write to stop
   * orphaned rows that would silently disappear from developer and project
   * views.
   */
  private async assertReferencesExist(developerId: string, projectId: string): Promise<void> {
    const [developers, projects] = await Promise.all([this.getDevelopers(), this.getProjects()])

    if (!developers.some((developer) => developer.id === developerId)) {
      throw new ReferentialIntegrityError('developerId', developerId)
    }

    if (!projects.some((project) => project.id === projectId)) {
      throw new ReferentialIntegrityError('projectId', projectId)
    }
  }

  private assertWritable(): void {
    if (!this.gateway.canWrite) throw new ReadOnlyDataSourceError(this.name)
  }

  private assertUniqueIds(table: DataSourceTable, ids: readonly string[]): void {
    const duplicates = findDuplicateIds(ids)
    if (duplicates.length > 0) throw new DuplicateRecordError(table, duplicates)
  }

  private reportIssues(table: DataSourceTable, issues: readonly RowValidationIssue[]): void {
    if (issues.length === 0) return
    if (this.strictRowValidation) throw new RowValidationError(table, issues)
    this.onRowValidationIssues?.(table, issues)
  }
}
