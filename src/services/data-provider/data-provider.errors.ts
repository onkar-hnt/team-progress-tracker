/** Identifies which table a row-level problem came from. */
export type DataSourceTable = 'DailyWork' | 'Developers' | 'Projects'

/** A single row that failed validation, kept so the UI can report specifics. */
export interface RowValidationIssue {
  /** Position within the returned table, for diagnostics only. Never a key. */
  index: number
  /** `EntryId`/`DeveloperId`/`ProjectId` when it could be read. */
  recordId?: string
  messages: string[]
}

/** Base class for every failure surfaced by the data layer. */
export class DataProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DataProviderError'
  }
}

/** The backend could not be reached, or is not configured yet. */
export class DataSourceUnavailableError extends DataProviderError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DataSourceUnavailableError'
  }
}

/** The workbook is missing a required table or column, so mapping is unsafe. */
export class SchemaMismatchError extends DataProviderError {
  readonly table: DataSourceTable
  readonly missingColumns: readonly string[]

  constructor(table: DataSourceTable, missingColumns: readonly string[]) {
    super(
      `Table "${table}" is missing required column(s): ${missingColumns.join(', ')}. ` +
        'The workbook structure must match the agreed schema.',
    )
    this.name = 'SchemaMismatchError'
    this.table = table
    this.missingColumns = missingColumns
  }
}

/** Rows were readable but individually invalid. */
export class RowValidationError extends DataProviderError {
  readonly table: DataSourceTable
  readonly issues: readonly RowValidationIssue[]

  constructor(table: DataSourceTable, issues: readonly RowValidationIssue[]) {
    super(`Table "${table}" contains ${issues.length} invalid row(s).`)
    this.name = 'RowValidationError'
    this.table = table
    this.issues = issues
  }
}

/** Two rows share an identifier, so records cannot be resolved reliably. */
export class DuplicateRecordError extends DataProviderError {
  readonly table: DataSourceTable
  readonly recordIds: readonly string[]

  constructor(table: DataSourceTable, recordIds: readonly string[]) {
    super(`Table "${table}" contains duplicate id(s): ${recordIds.join(', ')}.`)
    this.name = 'DuplicateRecordError'
    this.table = table
    this.recordIds = recordIds
  }
}

export class RecordNotFoundError extends DataProviderError {
  readonly table: DataSourceTable
  readonly recordId: string

  constructor(table: DataSourceTable, recordId: string) {
    super(`No record with id "${recordId}" exists in table "${table}".`)
    this.name = 'RecordNotFoundError'
    this.table = table
    this.recordId = recordId
  }
}

/** A write was attempted against a provider that cannot persist changes. */
export class ReadOnlyDataSourceError extends DataProviderError {
  constructor(providerName: string) {
    super(`The "${providerName}" data source is read-only and cannot save changes.`)
    this.name = 'ReadOnlyDataSourceError'
  }
}

/** A referenced developer or project does not exist in its lookup table. */
export class ReferentialIntegrityError extends DataProviderError {
  readonly field: 'developerId' | 'projectId'
  readonly value: string

  constructor(field: 'developerId' | 'projectId', value: string) {
    super(`"${value}" is not a known ${field === 'developerId' ? 'developer' : 'project'}.`)
    this.name = 'ReferentialIntegrityError'
    this.field = field
    this.value = value
  }
}
