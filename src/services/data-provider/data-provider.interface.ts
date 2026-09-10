import type {
  CreateDailyWorkEntryRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  Developer,
  Project,
  UpdateDailyWorkEntryRequest,
} from '@models/index'

/**
 * What a backend is able to do, so the UI can disable actions instead of
 * failing at save time.
 *
 * A workbook opened through a read-only integration, or a purely static
 * deployment, will report `canWrite: false`.
 */
export interface DataProviderCapabilities {
  canWrite: boolean
}

/**
 * The single boundary between the application and its storage.
 *
 * Everything above this interface works in domain models and knows nothing
 * about Excel, SharePoint, Microsoft Graph, HTTP or SQL. Replacing the
 * implementation is therefore the only work required to change backend.
 *
 * Implementations must:
 * - return domain models, never raw rows or provider-specific shapes
 * - throw the typed errors in `data-provider.errors.ts` rather than raw ones
 * - treat `id` values as the only record keys, never positions or names
 */
export interface DataProvider {
  /** Stable identifier used in diagnostics and error messages. */
  readonly name: string

  readonly capabilities: DataProviderCapabilities

  getDevelopers(): Promise<Developer[]>

  getProjects(): Promise<Project[]>

  /**
   * Entries matching `query`, or all entries when omitted.
   *
   * Ordering is not guaranteed; callers that display data must sort explicitly.
   */
  getDailyWorkEntries(query?: DailyWorkQuery): Promise<DailyWorkEntry[]>

  /** Resolves to `null` when no entry carries that id. */
  getDailyWorkEntryById(id: string): Promise<DailyWorkEntry | null>

  createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry>

  updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry>

  deleteDailyWorkEntry(id: string): Promise<void>
}
