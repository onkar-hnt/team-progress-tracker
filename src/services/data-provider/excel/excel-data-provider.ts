import type { z } from 'zod'

import type {
  AssignedTask,
  AssignedTaskQuery,
  CreateAssignedTaskRequest,
  CreateDailyWorkEntryRequest,
  CreateDeveloperRequest,
  CreateMentorCommentRequest,
  CreateMentorRequest,
  CreateProjectRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  Developer,
  Mentor,
  MentorAssignment,
  MentorComment,
  MentorCommentQuery,
  Project,
  UpdateAssignedTaskRequest,
  UpdateDailyWorkEntryRequest,
  UpdateDeveloperRequest,
  UpdateMentorCommentRequest,
  UpdateMentorRequest,
  UpdateProjectRequest,
} from '@models/index'

import { createDailyWorkEntryId, filterDailyWorkEntries } from '../daily-work-query'
import { createSequentialId, filterComments, filterTasks } from '../record-query'
import type { DataProvider, DataProviderCapabilities } from '../data-provider.interface'
import {
  DuplicateRecordError,
  ReadOnlyDataSourceError,
  RecordInUseError,
  RecordNotFoundError,
  ReferentialIntegrityError,
  RowValidationError,
  SchemaMismatchError,
} from '../data-provider.errors'
import type {
  DataSourceTable,
  ReferenceField,
  RowValidationIssue,
} from '../data-provider.errors'
import {
  assignedTaskSchema,
  dailyWorkEntrySchema,
  describeZodIssues,
  developerSchema,
  mentorCommentSchema,
  mentorSchema,
  projectSchema,
} from './excel-row.schemas'
import {
  findDuplicateIds,
  mapCommentRow,
  mapDailyWorkRow,
  mapDeveloperRow,
  mapMentorAssignmentRow,
  mapMentorRow,
  mapProjectRow,
  mapTableRows,
  mapTaskRow,
  toCommentRow,
  toDailyWorkRow,
  toDeveloperRow,
  toMentorAssignmentRow,
  toMentorRow,
  toProjectRow,
  toTaskRow,
} from './excel-mappers'
import type { RowMapResult } from './excel-mappers'
import {
  COMMENT_COLUMNS,
  DAILY_WORK_COLUMNS,
  DEVELOPER_COLUMNS,
  EXCEL_TABLES,
  MENTOR_COLUMNS,
  MENTOR_MAPPING_COLUMNS,
  PROJECT_COLUMNS,
  REQUIRED_COMMENT_COLUMNS,
  REQUIRED_DAILY_WORK_COLUMNS,
  REQUIRED_DEVELOPER_COLUMNS,
  REQUIRED_MENTOR_COLUMNS,
  REQUIRED_MENTOR_MAPPING_COLUMNS,
  REQUIRED_PROJECT_COLUMNS,
  REQUIRED_TASK_COLUMNS,
  TASK_COLUMNS,
} from './excel-schema'
import type { RawExcelRow } from './excel-schema'
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
 * Describes one workbook table, so reads and writes share a single definition.
 *
 * Without this, each of the six tables would repeat the same sequence of
 * schema check, map, duplicate-id check and key-column lookup, and the pieces
 * would eventually drift apart.
 */
interface TableDefinition<TRecord> {
  tableName: string
  label: DataSourceTable
  requiredColumns: readonly string[]
  keyColumn: string
  mapRow: (row: RawExcelRow) => RowMapResult<TRecord>
  toRow: (record: TRecord) => RawExcelRow
  readId: (record: TRecord) => string
  idPrefix: string
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

  private readonly developerTable: TableDefinition<Developer> = {
    tableName: EXCEL_TABLES.developers,
    label: 'Developers',
    requiredColumns: REQUIRED_DEVELOPER_COLUMNS,
    keyColumn: DEVELOPER_COLUMNS.developerId,
    mapRow: mapDeveloperRow,
    toRow: toDeveloperRow,
    readId: (developer) => developer.id,
    idPrefix: 'DEV',
  }

  private readonly mentorTable: TableDefinition<Mentor> = {
    tableName: EXCEL_TABLES.mentors,
    label: 'Mentors',
    requiredColumns: REQUIRED_MENTOR_COLUMNS,
    keyColumn: MENTOR_COLUMNS.mentorId,
    mapRow: mapMentorRow,
    toRow: toMentorRow,
    readId: (mentor) => mentor.id,
    idPrefix: 'MEN',
  }

  private readonly projectTable: TableDefinition<Project> = {
    tableName: EXCEL_TABLES.projects,
    label: 'Projects',
    requiredColumns: REQUIRED_PROJECT_COLUMNS,
    keyColumn: PROJECT_COLUMNS.projectId,
    mapRow: mapProjectRow,
    toRow: toProjectRow,
    readId: (project) => project.id,
    idPrefix: 'PRJ',
  }

  private readonly taskTable: TableDefinition<AssignedTask> = {
    tableName: EXCEL_TABLES.tasks,
    label: 'Tasks',
    requiredColumns: REQUIRED_TASK_COLUMNS,
    keyColumn: TASK_COLUMNS.taskId,
    mapRow: mapTaskRow,
    toRow: toTaskRow,
    readId: (task) => task.id,
    idPrefix: 'TSK',
  }

  private readonly commentTable: TableDefinition<MentorComment> = {
    tableName: EXCEL_TABLES.comments,
    label: 'Comments',
    requiredColumns: REQUIRED_COMMENT_COLUMNS,
    keyColumn: COMMENT_COLUMNS.commentId,
    mapRow: mapCommentRow,
    toRow: toCommentRow,
    readId: (comment) => comment.id,
    idPrefix: 'CMT',
  }

  private readonly dailyWorkTable: TableDefinition<DailyWorkEntry> = {
    tableName: EXCEL_TABLES.dailyWork,
    label: 'DailyWork',
    requiredColumns: REQUIRED_DAILY_WORK_COLUMNS,
    keyColumn: DAILY_WORK_COLUMNS.entryId,
    mapRow: mapDailyWorkRow,
    toRow: toDailyWorkRow,
    readId: (entry) => entry.id,
    idPrefix: 'ENT',
  }

  constructor(options: ExcelDataProviderOptions) {
    this.gateway = options.gateway
    this.strictRowValidation = options.strictRowValidation ?? false
    this.onRowValidationIssues = options.onRowValidationIssues
  }

  get capabilities(): DataProviderCapabilities {
    return { canWrite: this.gateway.canWrite }
  }

  getDevelopers(): Promise<Developer[]> {
    return this.readRecords(this.developerTable)
  }

  async createDeveloper(request: CreateDeveloperRequest): Promise<Developer> {
    return this.appendRecord(this.developerTable, developerSchema, request)
  }

  async updateDeveloper(id: string, request: UpdateDeveloperRequest): Promise<Developer> {
    const existing = await this.requireRecord(this.developerTable, id)
    return this.writeRecord(this.developerTable, developerSchema, {
      ...existing,
      ...request,
      id: existing.id,
    })
  }

  async deleteDeveloper(id: string): Promise<void> {
    this.assertWritable()
    await this.requireRecord(this.developerTable, id)

    const [tasks, entries, comments] = await Promise.all([
      this.readRecords(this.taskTable),
      this.readRecords(this.dailyWorkTable),
      this.readRecords(this.commentTable),
    ])

    assertNotInUse('Developers', id, [
      countLabel(tasks.filter((task) => task.developerId === id).length, 'task'),
      countLabel(entries.filter((entry) => entry.developerId === id).length, 'work entry'),
      countLabel(comments.filter((comment) => comment.developerId === id).length, 'comment'),
    ])

    await this.gateway.deleteRowByKey(this.developerTable.tableName, this.developerTable.keyColumn, id)
    // Assignments are part of the mapping, not data in their own right, so
    // they follow the employee out rather than blocking the delete.
    await this.gateway.deleteRowsByKey(
      EXCEL_TABLES.mentorMapping,
      MENTOR_MAPPING_COLUMNS.developerId,
      id,
    )
  }

  getMentors(): Promise<Mentor[]> {
    return this.readRecords(this.mentorTable)
  }

  createMentor(request: CreateMentorRequest): Promise<Mentor> {
    return this.appendRecord(this.mentorTable, mentorSchema, request)
  }

  async updateMentor(id: string, request: UpdateMentorRequest): Promise<Mentor> {
    const existing = await this.requireRecord(this.mentorTable, id)
    return this.writeRecord(this.mentorTable, mentorSchema, {
      ...existing,
      ...request,
      id: existing.id,
    })
  }

  async deleteMentor(id: string): Promise<void> {
    this.assertWritable()
    await this.requireRecord(this.mentorTable, id)

    const [comments, projects] = await Promise.all([
      this.readRecords(this.commentTable),
      this.readRecords(this.projectTable),
    ])

    assertNotInUse('Mentors', id, [
      countLabel(comments.filter((comment) => comment.mentorId === id).length, 'comment'),
      countLabel(projects.filter((project) => project.mentorId === id).length, 'project'),
    ])

    await this.gateway.deleteRowByKey(this.mentorTable.tableName, this.mentorTable.keyColumn, id)
    await this.gateway.deleteRowsByKey(
      EXCEL_TABLES.mentorMapping,
      MENTOR_MAPPING_COLUMNS.mentorId,
      id,
    )
  }

  async getMentorAssignments(): Promise<MentorAssignment[]> {
    const table = await this.readTable(
      EXCEL_TABLES.mentorMapping,
      'MentorMapping',
      REQUIRED_MENTOR_MAPPING_COLUMNS,
    )

    const mapped = mapTableRows(table.rows, mapMentorAssignmentRow, () => undefined)
    this.reportIssues('MentorMapping', mapped.issues)

    // The mapping has no single-column key, so duplicates are de-duplicated
    // rather than rejected: a repeated pair is redundant, not ambiguous.
    const seen = new Set<string>()
    return mapped.records.filter((assignment) => {
      const key = `${assignment.mentorId}|${assignment.developerId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  async setMentorAssignments(
    mentorId: string,
    developerIds: readonly string[],
  ): Promise<MentorAssignment[]> {
    this.assertWritable()
    await this.requireRecord(this.mentorTable, mentorId)

    const developers = await this.readRecords(this.developerTable)
    for (const developerId of developerIds) {
      if (!developers.some((developer) => developer.id === developerId)) {
        throw new ReferentialIntegrityError('developerId', developerId)
      }
    }

    const unique = [...new Set(developerIds)]

    await this.gateway.deleteRowsByKey(
      EXCEL_TABLES.mentorMapping,
      MENTOR_MAPPING_COLUMNS.mentorId,
      mentorId,
    )

    if (unique.length > 0) {
      await this.gateway.appendRows(
        EXCEL_TABLES.mentorMapping,
        unique.map((developerId) => toMentorAssignmentRow({ mentorId, developerId })),
      )
    }

    return unique.map((developerId) => ({ mentorId, developerId }))
  }

  getProjects(): Promise<Project[]> {
    return this.readRecords(this.projectTable)
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    await this.assertProjectReferences(request)
    return this.appendRecord(this.projectTable, projectSchema, request)
  }

  async updateProject(id: string, request: UpdateProjectRequest): Promise<Project> {
    const existing = await this.requireRecord(this.projectTable, id)
    const merged = { ...existing, ...request, id: existing.id }

    await this.assertProjectReferences(merged)
    return this.writeRecord(this.projectTable, projectSchema, merged)
  }

  async deleteProject(id: string): Promise<void> {
    this.assertWritable()
    await this.requireRecord(this.projectTable, id)

    const [tasks, entries] = await Promise.all([
      this.readRecords(this.taskTable),
      this.readRecords(this.dailyWorkTable),
    ])

    assertNotInUse('Projects', id, [
      countLabel(tasks.filter((task) => task.projectId === id).length, 'task'),
      countLabel(entries.filter((entry) => entry.projectId === id).length, 'work entry'),
    ])

    await this.gateway.deleteRowByKey(this.projectTable.tableName, this.projectTable.keyColumn, id)
  }

  async getTasks(query?: AssignedTaskQuery): Promise<AssignedTask[]> {
    const tasks = await this.readRecords(this.taskTable)
    return filterTasks(tasks, query)
  }

  async getTaskById(id: string): Promise<AssignedTask | null> {
    const tasks = await this.readRecords(this.taskTable)
    return tasks.find((task) => task.id === id) ?? null
  }

  async createTask(request: CreateAssignedTaskRequest): Promise<AssignedTask> {
    await this.assertTaskReferences(request)
    return this.appendRecord(this.taskTable, assignedTaskSchema, {
      ...request,
      updatedAt: new Date().toISOString(),
    })
  }

  async updateTask(id: string, request: UpdateAssignedTaskRequest): Promise<AssignedTask> {
    const existing = await this.requireRecord(this.taskTable, id)
    const merged = {
      ...existing,
      ...request,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    }

    await this.assertTaskReferences(merged)
    return this.writeRecord(this.taskTable, assignedTaskSchema, merged)
  }

  async deleteTask(id: string): Promise<void> {
    this.assertWritable()
    await this.gateway.deleteRowByKey(this.taskTable.tableName, this.taskTable.keyColumn, id)
  }

  async getComments(query?: MentorCommentQuery): Promise<MentorComment[]> {
    const comments = await this.readRecords(this.commentTable)
    return filterComments(comments, query)
  }

  async createComment(request: CreateMentorCommentRequest): Promise<MentorComment> {
    await this.assertCommentReferences(request)

    const now = new Date().toISOString()
    return this.appendRecord(this.commentTable, mentorCommentSchema, {
      ...request,
      createdAt: now,
      updatedAt: now,
    })
  }

  async updateComment(
    id: string,
    request: UpdateMentorCommentRequest,
  ): Promise<MentorComment> {
    const existing = await this.requireRecord(this.commentTable, id)
    const merged = {
      ...existing,
      ...request,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }

    await this.assertCommentReferences(merged)
    return this.writeRecord(this.commentTable, mentorCommentSchema, merged)
  }

  async deleteComment(id: string): Promise<void> {
    this.assertWritable()
    await this.gateway.deleteRowByKey(this.commentTable.tableName, this.commentTable.keyColumn, id)
  }

  async getDailyWorkEntries(query?: DailyWorkQuery): Promise<DailyWorkEntry[]> {
    const entries = await this.readRecords(this.dailyWorkTable)
    return filterDailyWorkEntries(entries, query)
  }

  async getDailyWorkEntryById(id: string): Promise<DailyWorkEntry | null> {
    const entries = await this.readRecords(this.dailyWorkTable)
    return entries.find((entry) => entry.id === id) ?? null
  }

  async createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry> {
    this.assertWritable()
    await this.assertReferenceExists('developerId', request.developerId)
    await this.assertReferenceExists('projectId', request.projectId)

    const now = new Date().toISOString()
    const entry = this.validate(
      this.dailyWorkTable.label,
      dailyWorkEntrySchema,
      { ...request, id: createDailyWorkEntryId(), createdAt: now, updatedAt: now },
    )

    await this.gateway.appendRow(this.dailyWorkTable.tableName, toDailyWorkRow(entry))
    return entry
  }

  async updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry> {
    const existing = await this.requireRecord(this.dailyWorkTable, id)

    await this.assertReferenceExists('developerId', request.developerId ?? existing.developerId)
    await this.assertReferenceExists('projectId', request.projectId ?? existing.projectId)

    return this.writeRecord(this.dailyWorkTable, dailyWorkEntrySchema, {
      ...existing,
      ...request,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    })
  }

  async deleteDailyWorkEntry(id: string): Promise<void> {
    this.assertWritable()
    await this.gateway.deleteRowByKey(
      this.dailyWorkTable.tableName,
      this.dailyWorkTable.keyColumn,
      id,
    )
  }

  /** Schema check, map, report bad rows, reject duplicate ids. */
  private async readRecords<TRecord>(
    definition: TableDefinition<TRecord>,
  ): Promise<TRecord[]> {
    const table = await this.readTable(
      definition.tableName,
      definition.label,
      definition.requiredColumns,
    )

    const mapped = mapTableRows(table.rows, definition.mapRow, (row) =>
      parseExcelTextCell(row[definition.keyColumn]) ?? undefined,
    )

    this.reportIssues(definition.label, mapped.issues)
    this.assertUniqueIds(definition.label, mapped.records.map(definition.readId))

    return mapped.records
  }

  private async requireRecord<TRecord>(
    definition: TableDefinition<TRecord>,
    id: string,
  ): Promise<TRecord> {
    const records = await this.readRecords(definition)
    const record = records.find((candidate) => definition.readId(candidate) === id)
    if (record === undefined) throw new RecordNotFoundError(definition.label, id)
    return record
  }

  /** Validates, assigns a fresh id and appends the row. */
  private async appendRecord<TRecord>(
    definition: TableDefinition<TRecord>,
    schema: z.ZodType<TRecord>,
    candidate: unknown,
  ): Promise<TRecord> {
    this.assertWritable()

    const existing = await this.readRecords(definition)
    const record = this.validate(definition.label, schema, {
      ...(candidate as Record<string, unknown>),
      id: createSequentialId(definition.idPrefix, existing.map(definition.readId)),
    })

    await this.gateway.appendRow(definition.tableName, definition.toRow(record))
    return record
  }

  /** Validates and replaces the existing row, addressed by its key column. */
  private async writeRecord<TRecord>(
    definition: TableDefinition<TRecord>,
    schema: z.ZodType<TRecord>,
    candidate: unknown,
  ): Promise<TRecord> {
    this.assertWritable()

    const record = this.validate(definition.label, schema, candidate)
    await this.gateway.updateRowByKey(
      definition.tableName,
      definition.keyColumn,
      definition.readId(record),
      definition.toRow(record),
    )

    return record
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

  private validate<TValue>(
    table: DataSourceTable,
    schema: z.ZodType<TValue>,
    candidate: unknown,
  ): TValue {
    const result = schema.safeParse(candidate)
    if (!result.success) {
      throw new RowValidationError(table, [
        { index: 0, messages: describeZodIssues(result.error) },
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
  private async assertReferenceExists(field: ReferenceField, value: string): Promise<void> {
    const records =
      field === 'developerId'
        ? await this.readRecords(this.developerTable)
        : field === 'projectId'
          ? await this.readRecords(this.projectTable)
          : await this.readRecords(this.mentorTable)

    if (!records.some((record) => record.id === value)) {
      throw new ReferentialIntegrityError(field, value)
    }
  }

  private async assertProjectReferences(project: {
    mentorId?: string
    assignedDeveloperIds: readonly string[]
  }): Promise<void> {
    if (project.mentorId !== undefined) {
      await this.assertReferenceExists('mentorId', project.mentorId)
    }

    if (project.assignedDeveloperIds.length === 0) return

    const developers = await this.readRecords(this.developerTable)
    for (const developerId of project.assignedDeveloperIds) {
      if (!developers.some((developer) => developer.id === developerId)) {
        throw new ReferentialIntegrityError('developerId', developerId)
      }
    }
  }

  private async assertTaskReferences(task: {
    developerId: string
    projectId: string
    mentorId?: string
  }): Promise<void> {
    await this.assertReferenceExists('developerId', task.developerId)
    await this.assertReferenceExists('projectId', task.projectId)
    if (task.mentorId !== undefined) await this.assertReferenceExists('mentorId', task.mentorId)
  }

  private async assertCommentReferences(comment: {
    developerId: string
    mentorId: string
    projectId?: string
  }): Promise<void> {
    await this.assertReferenceExists('developerId', comment.developerId)
    await this.assertReferenceExists('mentorId', comment.mentorId)
    if (comment.projectId !== undefined) {
      await this.assertReferenceExists('projectId', comment.projectId)
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

/** `null` when the count is zero, so callers can drop non-blocking dependents. */
function countLabel(count: number, noun: string): string | null {
  if (count === 0) return null
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`
}

function assertNotInUse(
  table: DataSourceTable,
  recordId: string,
  dependents: readonly (string | null)[],
): void {
  const blocking = dependents.filter((entry): entry is string => entry !== null)
  if (blocking.length > 0) throw new RecordInUseError(table, recordId, blocking)
}
