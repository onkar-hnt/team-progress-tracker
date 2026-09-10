import type {
  DailyWorkEntry,
  Developer,
  Project,
  TaskPriority,
  TaskStatus,
} from '@models/index'

import type { RowValidationIssue } from '../data-provider.errors'
import {
  DAILY_WORK_COLUMNS,
  DEVELOPER_COLUMNS,
  EXCEL_PRIORITY_VALUES,
  EXCEL_STATUS_VALUES,
  PROJECT_COLUMNS,
} from './excel-schema'
import type { RawExcelRow } from './excel-schema'
import {
  dailyWorkEntrySchema,
  describeZodIssues,
  developerSchema,
  projectSchema,
} from './excel-row.schemas'
import {
  formatExcelBoolean,
  parseExcelBooleanCell,
  parseExcelDateCell,
  parseExcelNumberCell,
  parseExcelTextCell,
  parseExcelTimestampCell,
} from './excel-value.utils'

/**
 * Translation between workbook rows and domain models.
 *
 * This module is the only place that knows Excel column names, which is what
 * allows the rest of the application to be storage-agnostic.
 */

export type RowMapResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; messages: string[] }

/** Case-insensitive reverse lookups, so `in progress` reads the same as `In Progress`. */
const STATUS_BY_EXCEL_VALUE = new Map<string, TaskStatus>(
  Object.entries(EXCEL_STATUS_VALUES).map(([status, label]) => [
    label.toLowerCase(),
    status as TaskStatus,
  ]),
)

const PRIORITY_BY_EXCEL_VALUE = new Map<string, TaskPriority>(
  Object.entries(EXCEL_PRIORITY_VALUES).map(([priority, label]) => [
    label.toLowerCase(),
    priority as TaskPriority,
  ]),
)

function readCell(row: RawExcelRow, column: string): unknown {
  return row[column]
}

/**
 * Builds `{ key: value }` for a present value, or `{}` for a blank cell.
 *
 * Spreading this omits optional keys entirely rather than setting them to
 * `undefined`, so "the cell was blank" has exactly one representation in the
 * domain model instead of depending on how the validator treats a key that
 * exists but holds `undefined`.
 */
function optionalField<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Record<TKey, TValue> | Record<string, never> {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>)
}

export function mapDeveloperRow(row: RawExcelRow): RowMapResult<Developer> {
  const candidate = {
    id: parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.developerId)) ?? '',
    name: parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.developerName)) ?? '',
    ...optionalField('role', parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.role))),
    ...optionalField('location', parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.location))),
    // A blank Active cell means the row was added without deciding; treating
    // that as active keeps new joiners visible rather than silently hidden.
    active: parseExcelBooleanCell(readCell(row, DEVELOPER_COLUMNS.active)) ?? true,
  }

  const result = developerSchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

export function mapProjectRow(row: RawExcelRow): RowMapResult<Project> {
  const candidate = {
    id: parseExcelTextCell(readCell(row, PROJECT_COLUMNS.projectId)) ?? '',
    name: parseExcelTextCell(readCell(row, PROJECT_COLUMNS.projectName)) ?? '',
    ...optionalField('client', parseExcelTextCell(readCell(row, PROJECT_COLUMNS.client))),
    active: parseExcelBooleanCell(readCell(row, PROJECT_COLUMNS.active)) ?? true,
  }

  const result = projectSchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

export function mapDailyWorkRow(row: RawExcelRow): RowMapResult<DailyWorkEntry> {
  const rawStatus = parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.status))
  const rawPriority = parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.priority))
  const date = parseExcelDateCell(readCell(row, DAILY_WORK_COLUMNS.date))

  const messages: string[] = []

  if (date === null) {
    messages.push(
      `${DAILY_WORK_COLUMNS.date}: could not be read as a date. Store a real Excel date or an ISO yyyy-MM-dd value.`,
    )
  }

  const status = rawStatus === null ? undefined : STATUS_BY_EXCEL_VALUE.get(rawStatus.toLowerCase())
  if (status === undefined) {
    messages.push(
      `${DAILY_WORK_COLUMNS.status}: "${rawStatus ?? ''}" is not one of ${Object.values(EXCEL_STATUS_VALUES).join(', ')}.`,
    )
  }

  const priority =
    rawPriority === null ? undefined : PRIORITY_BY_EXCEL_VALUE.get(rawPriority.toLowerCase())
  if (priority === undefined) {
    messages.push(
      `${DAILY_WORK_COLUMNS.priority}: "${rawPriority ?? ''}" is not one of ${Object.values(EXCEL_PRIORITY_VALUES).join(', ')}.`,
    )
  }

  if (messages.length > 0) return { ok: false, messages }

  // Audit columns are often blank in hand-entered rows. Falling back to the
  // work date rather than "now" keeps values stable across refetches, which
  // matters for caching and for sorting by last update.
  const fallbackTimestamp = `${date ?? ''}T00:00:00.000Z`
  const createdAt =
    parseExcelTimestampCell(readCell(row, DAILY_WORK_COLUMNS.createdAt)) ?? fallbackTimestamp
  const updatedAt =
    parseExcelTimestampCell(readCell(row, DAILY_WORK_COLUMNS.updatedAt)) ?? createdAt

  const candidate = {
    id: parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.entryId)) ?? '',
    date,
    developerId: parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.developerId)) ?? '',
    projectId: parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.projectId)) ?? '',
    taskTitle: parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.taskTitle)) ?? '',
    ...optionalField(
      'description',
      parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.taskDescription)),
    ),
    status,
    priority,
    // A blank Progress cell is normal for work that has not started.
    progress: parseExcelNumberCell(readCell(row, DAILY_WORK_COLUMNS.progress)) ?? 0,
    ...optionalField(
      'hoursSpent',
      parseExcelNumberCell(readCell(row, DAILY_WORK_COLUMNS.hoursSpent)),
    ),
    isBlocked: parseExcelBooleanCell(readCell(row, DAILY_WORK_COLUMNS.isBlocked)) ?? false,
    ...optionalField(
      'blockerDescription',
      parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.blockerDescription)),
    ),
    ...optionalField('remarks', parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.remarks))),
    createdAt,
    updatedAt,
  }

  const result = dailyWorkEntrySchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

/**
 * Serialises an entry back into a workbook row.
 *
 * The date is written as an ISO `yyyy-MM-dd` string rather than a serial so
 * the stored value is unambiguous regardless of the column's number format.
 * Reads accept both, so this choice can be revisited without a migration.
 */
export function toDailyWorkRow(entry: DailyWorkEntry): RawExcelRow {
  return {
    [DAILY_WORK_COLUMNS.entryId]: entry.id,
    [DAILY_WORK_COLUMNS.date]: entry.date,
    [DAILY_WORK_COLUMNS.developerId]: entry.developerId,
    [DAILY_WORK_COLUMNS.projectId]: entry.projectId,
    [DAILY_WORK_COLUMNS.taskTitle]: entry.taskTitle,
    [DAILY_WORK_COLUMNS.taskDescription]: entry.description ?? '',
    [DAILY_WORK_COLUMNS.status]: EXCEL_STATUS_VALUES[entry.status],
    [DAILY_WORK_COLUMNS.priority]: EXCEL_PRIORITY_VALUES[entry.priority],
    [DAILY_WORK_COLUMNS.progress]: entry.progress,
    [DAILY_WORK_COLUMNS.hoursSpent]: entry.hoursSpent ?? '',
    [DAILY_WORK_COLUMNS.isBlocked]: formatExcelBoolean(entry.isBlocked),
    [DAILY_WORK_COLUMNS.blockerDescription]: entry.blockerDescription ?? '',
    [DAILY_WORK_COLUMNS.remarks]: entry.remarks ?? '',
    [DAILY_WORK_COLUMNS.createdAt]: entry.createdAt,
    [DAILY_WORK_COLUMNS.updatedAt]: entry.updatedAt,
  }
}

export interface MappedTable<TValue> {
  records: TValue[]
  issues: RowValidationIssue[]
}

/**
 * Maps every row, keeping good records and collecting failures.
 *
 * One malformed row should not blank out the dashboard, so mapping is
 * per-row and the caller decides how loudly to report `issues`.
 */
export function mapTableRows<TValue>(
  rows: readonly RawExcelRow[],
  mapRow: (row: RawExcelRow) => RowMapResult<TValue>,
  readRecordId: (row: RawExcelRow) => string | undefined,
): MappedTable<TValue> {
  const records: TValue[] = []
  const issues: RowValidationIssue[] = []

  rows.forEach((row, index) => {
    const result = mapRow(row)
    if (result.ok) {
      records.push(result.value)
      return
    }

    const recordId = readRecordId(row)
    issues.push(recordId === undefined ? { index, messages: result.messages } : { index, recordId, messages: result.messages })
  })

  return { records, issues }
}

/** Ids appearing more than once, which would make records unresolvable. */
export function findDuplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id)
    else seen.add(id)
  }

  return [...duplicates]
}
