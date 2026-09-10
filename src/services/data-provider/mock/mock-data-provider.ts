import dailyWorkRows from '@data/daily-work.table.json'
import developerRows from '@data/developers.table.json'
import projectRows from '@data/projects.table.json'

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
  RecordNotFoundError,
  ReferentialIntegrityError,
  RowValidationError,
} from '../data-provider.errors'
import { dailyWorkEntrySchema, describeZodIssues } from '../excel/excel-row.schemas'
import {
  mapDailyWorkRow,
  mapDeveloperRow,
  mapProjectRow,
  mapTableRows,
} from '../excel/excel-mappers'
import type { RawExcelRow } from '../excel/excel-schema'

/**
 * In-memory provider backed by workbook-shaped fixtures.
 *
 * The fixtures in `src/data` use Excel column names and Excel cell values, and
 * they are mapped with exactly the same code as the real workbook. That means
 * development continuously exercises the mapping and validation layer, so
 * switching to SharePoint is a configuration change rather than a rewrite, and
 * a schema mistake surfaces here rather than on the day of integration.
 *
 * Writes mutate memory only and are lost on reload, which is the honest
 * behaviour for a static deployment with no backend.
 */

const REFERENCE_DATE_FALLBACK = '2026-09-10'

function toRawRows(rows: readonly unknown[]): RawExcelRow[] {
  return rows as RawExcelRow[]
}

/** Fails loudly: an invalid fixture is a developer mistake, not bad user data. */
function loadFixture<TValue>(
  rows: readonly unknown[],
  mapRow: (row: RawExcelRow) => { ok: true; value: TValue } | { ok: false; messages: string[] },
  table: 'DailyWork' | 'Developers' | 'Projects',
): TValue[] {
  const mapped = mapTableRows(toRawRows(rows), mapRow, () => undefined)
  if (mapped.issues.length > 0) throw new RowValidationError(table, mapped.issues)
  return mapped.records
}

export interface MockDataProviderOptions {
  /** Artificial delay in milliseconds, to exercise loading states. */
  latencyMs?: number
}

export class MockDataProvider implements DataProvider {
  readonly name = 'mock'
  readonly capabilities: DataProviderCapabilities = { canWrite: true }

  private readonly developers: Developer[]
  private readonly projects: Project[]
  private entries: DailyWorkEntry[]
  private readonly latencyMs: number

  constructor(options: MockDataProviderOptions = {}) {
    this.developers = loadFixture(developerRows, mapDeveloperRow, 'Developers')
    this.projects = loadFixture(projectRows, mapProjectRow, 'Projects')
    this.entries = loadFixture(dailyWorkRows, mapDailyWorkRow, 'DailyWork')
    this.latencyMs = options.latencyMs ?? 0
  }

  /**
   * The most recent date present in the fixtures.
   *
   * Date-filtered screens can default to this so that development always shows
   * a populated dashboard, without the fixtures needing dates relative to now.
   */
  get referenceDate(): string {
    return this.entries.reduce(
      (latest, entry) => (entry.date > latest ? entry.date : latest),
      REFERENCE_DATE_FALLBACK,
    )
  }

  async getDevelopers(): Promise<Developer[]> {
    await this.simulateLatency()
    return this.developers.map((developer) => ({ ...developer }))
  }

  async getProjects(): Promise<Project[]> {
    await this.simulateLatency()
    return this.projects.map((project) => ({ ...project }))
  }

  async getDailyWorkEntries(query?: DailyWorkQuery): Promise<DailyWorkEntry[]> {
    await this.simulateLatency()
    return filterDailyWorkEntries(this.entries, query).map((entry) => ({ ...entry }))
  }

  async getDailyWorkEntryById(id: string): Promise<DailyWorkEntry | null> {
    await this.simulateLatency()
    const entry = this.entries.find((candidate) => candidate.id === id)
    return entry === undefined ? null : { ...entry }
  }

  async createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry> {
    await this.simulateLatency()
    this.assertReferencesExist(request.developerId, request.projectId)

    const now = new Date().toISOString()
    const entry = this.validateEntry({
      ...request,
      id: createDailyWorkEntryId(),
      createdAt: now,
      updatedAt: now,
    })

    this.entries = [...this.entries, entry]
    return { ...entry }
  }

  async updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry> {
    await this.simulateLatency()

    const index = this.entries.findIndex((candidate) => candidate.id === id)
    const existing = this.entries[index]
    if (existing === undefined) throw new RecordNotFoundError('DailyWork', id)

    this.assertReferencesExist(
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

    const next = [...this.entries]
    next[index] = entry
    this.entries = next

    return { ...entry }
  }

  async deleteDailyWorkEntry(id: string): Promise<void> {
    await this.simulateLatency()

    const remaining = this.entries.filter((entry) => entry.id !== id)
    if (remaining.length === this.entries.length) {
      throw new RecordNotFoundError('DailyWork', id)
    }

    this.entries = remaining
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

  private assertReferencesExist(developerId: string, projectId: string): void {
    if (!this.developers.some((developer) => developer.id === developerId)) {
      throw new ReferentialIntegrityError('developerId', developerId)
    }

    if (!this.projects.some((project) => project.id === projectId)) {
      throw new ReferentialIntegrityError('projectId', projectId)
    }
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs <= 0) return
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
  }
}
