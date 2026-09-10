import type {
  AssignedTask,
  DailyWorkEntry,
  Developer,
  Mentor,
  MentorAssignment,
  MentorComment,
  Project,
  TaskPriority,
  TaskStatus,
} from '@models/index'

import type { RowValidationIssue } from '../data-provider.errors'
import {
  COMMENT_COLUMNS,
  DAILY_WORK_COLUMNS,
  DEVELOPER_COLUMNS,
  EXCEL_ACCESS_ROLE_VALUES,
  EXCEL_LIST_SEPARATOR,
  EXCEL_PRIORITY_VALUES,
  EXCEL_PROJECT_STATUS_VALUES,
  EXCEL_STATUS_VALUES,
  MENTOR_COLUMNS,
  MENTOR_MAPPING_COLUMNS,
  PROJECT_COLUMNS,
  TASK_COLUMNS,
} from './excel-schema'
import type { RawExcelRow } from './excel-schema'
import {
  assignedTaskSchema,
  dailyWorkEntrySchema,
  describeZodIssues,
  developerSchema,
  mentorAssignmentSchema,
  mentorCommentSchema,
  mentorSchema,
  projectSchema,
} from './excel-row.schemas'
import {
  formatExcelBoolean,
  formatExcelRecordStatus,
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

/** Case-insensitive reverse lookup builder for the enumerated columns. */
function buildValueLookup<TCode extends string>(
  values: Readonly<Record<TCode, string>>,
): Map<string, TCode> {
  return new Map(
    Object.entries<string>(values).map(([code, label]) => [label.toLowerCase(), code as TCode]),
  )
}

const PROJECT_STATUS_BY_EXCEL_VALUE = buildValueLookup(EXCEL_PROJECT_STATUS_VALUES)

const ACCESS_ROLE_BY_EXCEL_VALUE = buildValueLookup(EXCEL_ACCESS_ROLE_VALUES)

/**
 * Splits a delimited id cell.
 *
 * Both separators are accepted on read because a person editing the sheet by
 * hand will reach for a comma regardless of what the writer emits.
 */
function parseIdListCell(value: unknown): string[] {
  const text = parseExcelTextCell(value)
  if (text === null) return []

  return text
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

export function mapDeveloperRow(row: RawExcelRow): RowMapResult<Developer> {
  const rawAccessRole = parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.accessRole))
  const accessRole =
    rawAccessRole === null ? null : ACCESS_ROLE_BY_EXCEL_VALUE.get(rawAccessRole.toLowerCase()) ?? null

  const candidate = {
    id: parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.developerId)) ?? '',
    name: parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.developerName)) ?? '',
    ...optionalField('employeeId', parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.employeeId))),
    ...optionalField('role', parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.role))),
    ...optionalField('location', parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.location))),
    ...optionalField(
      'primaryProjectId',
      parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.projectId)),
    ),
    // A blank Status cell means the row was added without deciding; treating
    // that as active keeps new joiners visible rather than silently hidden.
    active: parseExcelBooleanCell(readCell(row, DEVELOPER_COLUMNS.status)) ?? true,
    ...optionalField('email', parseExcelTextCell(readCell(row, DEVELOPER_COLUMNS.email))),
    // An unrecognised AccessRole is left unset rather than rejected, so a typo
    // in that column costs the person their elevated access instead of hiding
    // their entire row from the application.
    ...optionalField('accessRole', accessRole),
    ...optionalField('createdDate', parseExcelDateCell(readCell(row, DEVELOPER_COLUMNS.createdDate))),
  }

  const result = developerSchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

export function toDeveloperRow(developer: Developer): RawExcelRow {
  return {
    [DEVELOPER_COLUMNS.developerId]: developer.id,
    [DEVELOPER_COLUMNS.employeeId]: developer.employeeId ?? '',
    [DEVELOPER_COLUMNS.developerName]: developer.name,
    [DEVELOPER_COLUMNS.email]: developer.email ?? '',
    [DEVELOPER_COLUMNS.role]: developer.role ?? '',
    [DEVELOPER_COLUMNS.location]: developer.location ?? '',
    [DEVELOPER_COLUMNS.projectId]: developer.primaryProjectId ?? '',
    [DEVELOPER_COLUMNS.accessRole]:
      developer.accessRole === undefined ? '' : EXCEL_ACCESS_ROLE_VALUES[developer.accessRole],
    [DEVELOPER_COLUMNS.status]: formatExcelRecordStatus(developer.active),
    [DEVELOPER_COLUMNS.createdDate]: developer.createdDate ?? '',
  }
}

export function mapMentorRow(row: RawExcelRow): RowMapResult<Mentor> {
  const candidate = {
    id: parseExcelTextCell(readCell(row, MENTOR_COLUMNS.mentorId)) ?? '',
    name: parseExcelTextCell(readCell(row, MENTOR_COLUMNS.mentorName)) ?? '',
    email: parseExcelTextCell(readCell(row, MENTOR_COLUMNS.email)) ?? '',
    active: parseExcelBooleanCell(readCell(row, MENTOR_COLUMNS.status)) ?? true,
    ...optionalField('createdDate', parseExcelDateCell(readCell(row, MENTOR_COLUMNS.createdDate))),
  }

  const result = mentorSchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

export function toMentorRow(mentor: Mentor): RawExcelRow {
  return {
    [MENTOR_COLUMNS.mentorId]: mentor.id,
    [MENTOR_COLUMNS.mentorName]: mentor.name,
    [MENTOR_COLUMNS.email]: mentor.email,
    [MENTOR_COLUMNS.status]: formatExcelRecordStatus(mentor.active),
    [MENTOR_COLUMNS.createdDate]: mentor.createdDate ?? '',
  }
}

export function mapMentorAssignmentRow(row: RawExcelRow): RowMapResult<MentorAssignment> {
  const candidate = {
    mentorId: parseExcelTextCell(readCell(row, MENTOR_MAPPING_COLUMNS.mentorId)) ?? '',
    developerId: parseExcelTextCell(readCell(row, MENTOR_MAPPING_COLUMNS.developerId)) ?? '',
    ...optionalField('id', parseExcelTextCell(readCell(row, MENTOR_MAPPING_COLUMNS.mappingId))),
    ...optionalField(
      'assignedDate',
      parseExcelDateCell(readCell(row, MENTOR_MAPPING_COLUMNS.assignedDate)),
    ),
    active: parseExcelBooleanCell(readCell(row, MENTOR_MAPPING_COLUMNS.status)) ?? true,
  }

  const result = mentorAssignmentSchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

export function toMentorAssignmentRow(assignment: MentorAssignment): RawExcelRow {
  return {
    [MENTOR_MAPPING_COLUMNS.mappingId]:
      assignment.id ?? `${assignment.mentorId}-${assignment.developerId}`,
    [MENTOR_MAPPING_COLUMNS.mentorId]: assignment.mentorId,
    [MENTOR_MAPPING_COLUMNS.developerId]: assignment.developerId,
    [MENTOR_MAPPING_COLUMNS.assignedDate]: assignment.assignedDate ?? '',
    [MENTOR_MAPPING_COLUMNS.status]: formatExcelRecordStatus(assignment.active ?? true),
  }
}

export function mapProjectRow(row: RawExcelRow): RowMapResult<Project> {
  const rawStatus = parseExcelTextCell(readCell(row, PROJECT_COLUMNS.status))

  // A blank or unrecognised Status reads as active, which is what an
  // in-flight project in a hand-edited sheet actually is.
  const status =
    rawStatus === null
      ? 'active'
      : PROJECT_STATUS_BY_EXCEL_VALUE.get(rawStatus.toLowerCase()) ?? 'active'

  const candidate = {
    id: parseExcelTextCell(readCell(row, PROJECT_COLUMNS.projectId)) ?? '',
    name: parseExcelTextCell(readCell(row, PROJECT_COLUMNS.projectName)) ?? '',
    ...optionalField('client', parseExcelTextCell(readCell(row, PROJECT_COLUMNS.clientName))),
    // Derived rather than stored: one Status column is easier to keep honest
    // than a separate Active flag that can contradict it.
    active: status !== 'completed',
    ...optionalField('description', parseExcelTextCell(readCell(row, PROJECT_COLUMNS.description))),
    status,
    ...optionalField('startDate', parseExcelDateCell(readCell(row, PROJECT_COLUMNS.startDate))),
    ...optionalField('endDate', parseExcelDateCell(readCell(row, PROJECT_COLUMNS.endDate))),
    ...optionalField('mentorId', parseExcelTextCell(readCell(row, PROJECT_COLUMNS.mentorId))),
    assignedDeveloperIds: parseIdListCell(readCell(row, PROJECT_COLUMNS.assignedDevelopers)),
  }

  const result = projectSchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

export function toProjectRow(project: Project): RawExcelRow {
  return {
    [PROJECT_COLUMNS.projectId]: project.id,
    [PROJECT_COLUMNS.projectName]: project.name,
    [PROJECT_COLUMNS.clientName]: project.client ?? '',
    [PROJECT_COLUMNS.description]: project.description ?? '',
    [PROJECT_COLUMNS.status]: EXCEL_PROJECT_STATUS_VALUES[project.status],
    [PROJECT_COLUMNS.startDate]: project.startDate ?? '',
    [PROJECT_COLUMNS.endDate]: project.endDate ?? '',
    [PROJECT_COLUMNS.mentorId]: project.mentorId ?? '',
    [PROJECT_COLUMNS.assignedDevelopers]: project.assignedDeveloperIds.join(EXCEL_LIST_SEPARATOR),
  }
}

export function mapTaskRow(row: RawExcelRow): RowMapResult<AssignedTask> {
  const rawStatus = parseExcelTextCell(readCell(row, TASK_COLUMNS.status))
  const rawPriority = parseExcelTextCell(readCell(row, TASK_COLUMNS.priority))

  const messages: string[] = []

  const status = rawStatus === null ? undefined : STATUS_BY_EXCEL_VALUE.get(rawStatus.toLowerCase())
  if (status === undefined) {
    messages.push(
      `${TASK_COLUMNS.status}: "${rawStatus ?? ''}" is not one of ${Object.values(EXCEL_STATUS_VALUES).join(', ')}.`,
    )
  }

  const priority =
    rawPriority === null ? undefined : PRIORITY_BY_EXCEL_VALUE.get(rawPriority.toLowerCase())
  if (priority === undefined) {
    messages.push(
      `${TASK_COLUMNS.priority}: "${rawPriority ?? ''}" is not one of ${Object.values(EXCEL_PRIORITY_VALUES).join(', ')}.`,
    )
  }

  if (messages.length > 0) return { ok: false, messages }

  // A task with no CreatedDate is dated by its due date where there is one,
  // so it still sorts sensibly instead of vanishing from date-bounded views.
  const dueDate = parseExcelDateCell(readCell(row, TASK_COLUMNS.dueDate))
  const createdDate = parseExcelDateCell(readCell(row, TASK_COLUMNS.createdDate)) ?? dueDate ?? ''

  const candidate = {
    id: parseExcelTextCell(readCell(row, TASK_COLUMNS.taskId)) ?? '',
    name: parseExcelTextCell(readCell(row, TASK_COLUMNS.taskTitle)) ?? '',
    ...optionalField('description', parseExcelTextCell(readCell(row, TASK_COLUMNS.taskDescription))),
    projectId: parseExcelTextCell(readCell(row, TASK_COLUMNS.projectId)) ?? '',
    developerId: parseExcelTextCell(readCell(row, TASK_COLUMNS.developerId)) ?? '',
    ...optionalField('mentorId', parseExcelTextCell(readCell(row, TASK_COLUMNS.mentorId))),
    priority,
    status,
    createdDate,
    ...optionalField('dueDate', dueDate),
    updatedAt:
      parseExcelTimestampCell(readCell(row, TASK_COLUMNS.updatedDate)) ??
      `${createdDate}T00:00:00.000Z`,
  }

  const result = assignedTaskSchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

export function toTaskRow(task: AssignedTask): RawExcelRow {
  return {
    [TASK_COLUMNS.taskId]: task.id,
    [TASK_COLUMNS.projectId]: task.projectId,
    [TASK_COLUMNS.developerId]: task.developerId,
    [TASK_COLUMNS.mentorId]: task.mentorId ?? '',
    [TASK_COLUMNS.taskTitle]: task.name,
    [TASK_COLUMNS.taskDescription]: task.description ?? '',
    [TASK_COLUMNS.priority]: EXCEL_PRIORITY_VALUES[task.priority],
    [TASK_COLUMNS.status]: EXCEL_STATUS_VALUES[task.status],
    [TASK_COLUMNS.createdDate]: task.createdDate,
    [TASK_COLUMNS.dueDate]: task.dueDate ?? '',
    [TASK_COLUMNS.updatedDate]: task.updatedAt,
  }
}

export function mapCommentRow(row: RawExcelRow): RowMapResult<MentorComment> {
  // CommentDate is the day the feedback is about, CreatedDate the day the row
  // was written. They are usually the same, so either will do and only the
  // absence of both is an error.
  const date =
    parseExcelDateCell(readCell(row, COMMENT_COLUMNS.commentDate)) ??
    parseExcelDateCell(readCell(row, COMMENT_COLUMNS.createdDate))

  if (date === null) {
    return {
      ok: false,
      messages: [
        `${COMMENT_COLUMNS.commentDate}: could not be read as a date, and ${COMMENT_COLUMNS.createdDate} is blank too. Store a real Excel date or an ISO yyyy-MM-dd value in one of them.`,
      ],
    }
  }

  const fallbackTimestamp = `${date}T00:00:00.000Z`
  const createdAt =
    parseExcelTimestampCell(readCell(row, COMMENT_COLUMNS.createdDate)) ?? fallbackTimestamp

  const candidate = {
    id: parseExcelTextCell(readCell(row, COMMENT_COLUMNS.commentId)) ?? '',
    developerId: parseExcelTextCell(readCell(row, COMMENT_COLUMNS.developerId)) ?? '',
    mentorId: parseExcelTextCell(readCell(row, COMMENT_COLUMNS.mentorId)) ?? '',
    ...optionalField('projectId', parseExcelTextCell(readCell(row, COMMENT_COLUMNS.projectId))),
    date,
    comment: parseExcelTextCell(readCell(row, COMMENT_COLUMNS.comment)) ?? '',
    ...optionalField(
      'progressUpdate',
      parseExcelTextCell(readCell(row, COMMENT_COLUMNS.progressUpdate)),
    ),
    ...optionalField('blockers', parseExcelTextCell(readCell(row, COMMENT_COLUMNS.blockers))),
    ...optionalField(
      'recommendations',
      parseExcelTextCell(readCell(row, COMMENT_COLUMNS.recommendations)),
    ),
    createdAt,
    updatedAt: parseExcelTimestampCell(readCell(row, COMMENT_COLUMNS.updatedDate)) ?? createdAt,
  }

  const result = mentorCommentSchema.safeParse(candidate)
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, messages: describeZodIssues(result.error) }
}

export function toCommentRow(comment: MentorComment): RawExcelRow {
  return {
    [COMMENT_COLUMNS.commentId]: comment.id,
    [COMMENT_COLUMNS.projectId]: comment.projectId ?? '',
    [COMMENT_COLUMNS.developerId]: comment.developerId,
    [COMMENT_COLUMNS.mentorId]: comment.mentorId,
    [COMMENT_COLUMNS.comment]: comment.comment,
    [COMMENT_COLUMNS.commentDate]: comment.date,
    [COMMENT_COLUMNS.progressUpdate]: comment.progressUpdate ?? '',
    [COMMENT_COLUMNS.blockers]: comment.blockers ?? '',
    [COMMENT_COLUMNS.recommendations]: comment.recommendations ?? '',
    [COMMENT_COLUMNS.createdDate]: comment.createdAt,
    [COMMENT_COLUMNS.updatedDate]: comment.updatedAt,
  }
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
    parseExcelTimestampCell(readCell(row, DAILY_WORK_COLUMNS.createdDate)) ?? fallbackTimestamp
  const updatedAt =
    parseExcelTimestampCell(readCell(row, DAILY_WORK_COLUMNS.updatedDate)) ?? createdAt

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
    ...optionalField('workDone', parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.workDone))),
    ...optionalField(
      'plannedWork',
      parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.plannedWork)),
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
      parseExcelTextCell(readCell(row, DAILY_WORK_COLUMNS.blockers)),
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
    [DAILY_WORK_COLUMNS.developerId]: entry.developerId,
    [DAILY_WORK_COLUMNS.projectId]: entry.projectId,
    [DAILY_WORK_COLUMNS.date]: entry.date,
    [DAILY_WORK_COLUMNS.taskTitle]: entry.taskTitle,
    [DAILY_WORK_COLUMNS.taskDescription]: entry.description ?? '',
    [DAILY_WORK_COLUMNS.workDone]: entry.workDone ?? '',
    [DAILY_WORK_COLUMNS.plannedWork]: entry.plannedWork ?? '',
    [DAILY_WORK_COLUMNS.status]: EXCEL_STATUS_VALUES[entry.status],
    [DAILY_WORK_COLUMNS.priority]: EXCEL_PRIORITY_VALUES[entry.priority],
    [DAILY_WORK_COLUMNS.progress]: entry.progress,
    [DAILY_WORK_COLUMNS.hoursSpent]: entry.hoursSpent ?? '',
    [DAILY_WORK_COLUMNS.isBlocked]: formatExcelBoolean(entry.isBlocked),
    [DAILY_WORK_COLUMNS.blockers]: entry.blockerDescription ?? '',
    [DAILY_WORK_COLUMNS.remarks]: entry.remarks ?? '',
    [DAILY_WORK_COLUMNS.createdDate]: entry.createdAt,
    [DAILY_WORK_COLUMNS.updatedDate]: entry.updatedAt,
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
