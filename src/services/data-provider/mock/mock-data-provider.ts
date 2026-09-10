import type { z } from 'zod'

import commentRows from '@data/comments.table.json'
import dailyWorkRows from '@data/daily-work.table.json'
import developerRows from '@data/developers.table.json'
import mentorMappingRows from '@data/mentor-mapping.table.json'
import mentorRows from '@data/mentors.table.json'
import projectRows from '@data/projects.table.json'
import taskRows from '@data/tasks.table.json'

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
import type { DataSourceTable } from '../data-provider.errors'
import {
  RecordInUseError,
  RecordNotFoundError,
  ReferentialIntegrityError,
  RowValidationError,
} from '../data-provider.errors'
import type { ReferenceField } from '../data-provider.errors'
import {
  assignedTaskSchema,
  dailyWorkEntrySchema,
  describeZodIssues,
  developerSchema,
  mentorCommentSchema,
  mentorSchema,
  projectSchema,
} from '../excel/excel-row.schemas'
import {
  mapCommentRow,
  mapDailyWorkRow,
  mapDeveloperRow,
  mapMentorAssignmentRow,
  mapMentorRow,
  mapProjectRow,
  mapTableRows,
  mapTaskRow,
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
  table: DataSourceTable,
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

  private developers: Developer[]
  private mentors: Mentor[]
  private assignments: MentorAssignment[]
  private projects: Project[]
  private tasks: AssignedTask[]
  private comments: MentorComment[]
  private entries: DailyWorkEntry[]
  private readonly latencyMs: number

  constructor(options: MockDataProviderOptions = {}) {
    this.developers = loadFixture(developerRows, mapDeveloperRow, 'Developers')
    this.mentors = loadFixture(mentorRows, mapMentorRow, 'Mentors')
    this.assignments = loadFixture(mentorMappingRows, mapMentorAssignmentRow, 'MentorMapping')
    this.projects = loadFixture(projectRows, mapProjectRow, 'Projects')
    this.tasks = loadFixture(taskRows, mapTaskRow, 'Tasks')
    this.comments = loadFixture(commentRows, mapCommentRow, 'Comments')
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

  async createDeveloper(request: CreateDeveloperRequest): Promise<Developer> {
    await this.simulateLatency()

    const developer = this.validate(
      developerSchema,
      { ...request, id: createSequentialId('DEV', this.developers.map((row) => row.id)) },
      'Developers',
    )

    this.developers = [...this.developers, developer]
    return { ...developer }
  }

  async updateDeveloper(id: string, request: UpdateDeveloperRequest): Promise<Developer> {
    await this.simulateLatency()

    const index = this.developers.findIndex((candidate) => candidate.id === id)
    const existing = this.developers[index]
    if (existing === undefined) throw new RecordNotFoundError('Developers', id)

    const developer = this.validate(
      developerSchema,
      { ...existing, ...request, id: existing.id },
      'Developers',
    )

    this.developers = replaceAt(this.developers, index, developer)
    return { ...developer }
  }

  async deleteDeveloper(id: string): Promise<void> {
    await this.simulateLatency()
    if (!this.developers.some((developer) => developer.id === id)) {
      throw new RecordNotFoundError('Developers', id)
    }

    this.assertNotInUse('Developers', id, [
      countLabel(this.tasks.filter((task) => task.developerId === id).length, 'task'),
      countLabel(this.entries.filter((entry) => entry.developerId === id).length, 'work entry'),
      countLabel(this.comments.filter((comment) => comment.developerId === id).length, 'comment'),
    ])

    this.developers = this.developers.filter((developer) => developer.id !== id)
    this.assignments = this.assignments.filter((assignment) => assignment.developerId !== id)
  }

  async getMentors(): Promise<Mentor[]> {
    await this.simulateLatency()
    return this.mentors.map((mentor) => ({ ...mentor }))
  }

  async createMentor(request: CreateMentorRequest): Promise<Mentor> {
    await this.simulateLatency()

    const mentor = this.validate(
      mentorSchema,
      { ...request, id: createSequentialId('MEN', this.mentors.map((row) => row.id)) },
      'Mentors',
    )

    this.mentors = [...this.mentors, mentor]
    return { ...mentor }
  }

  async updateMentor(id: string, request: UpdateMentorRequest): Promise<Mentor> {
    await this.simulateLatency()

    const index = this.mentors.findIndex((candidate) => candidate.id === id)
    const existing = this.mentors[index]
    if (existing === undefined) throw new RecordNotFoundError('Mentors', id)

    const mentor = this.validate(
      mentorSchema,
      { ...existing, ...request, id: existing.id },
      'Mentors',
    )

    this.mentors = replaceAt(this.mentors, index, mentor)
    return { ...mentor }
  }

  async deleteMentor(id: string): Promise<void> {
    await this.simulateLatency()
    if (!this.mentors.some((mentor) => mentor.id === id)) {
      throw new RecordNotFoundError('Mentors', id)
    }

    // Comments are a mentor's own record of their feedback, so they block the
    // delete. Assignments do not: they are the mapping itself and go with it.
    this.assertNotInUse('Mentors', id, [
      countLabel(this.comments.filter((comment) => comment.mentorId === id).length, 'comment'),
      countLabel(this.projects.filter((project) => project.mentorId === id).length, 'project'),
    ])

    this.mentors = this.mentors.filter((mentor) => mentor.id !== id)
    this.assignments = this.assignments.filter((assignment) => assignment.mentorId !== id)
    this.tasks = this.tasks.map((task) =>
      task.mentorId === id ? omitMentor(task) : task,
    )
  }

  async getMentorAssignments(): Promise<MentorAssignment[]> {
    await this.simulateLatency()
    return this.assignments.map((assignment) => ({ ...assignment }))
  }

  async setMentorAssignments(
    mentorId: string,
    developerIds: readonly string[],
  ): Promise<MentorAssignment[]> {
    await this.simulateLatency()

    if (!this.mentors.some((mentor) => mentor.id === mentorId)) {
      throw new ReferentialIntegrityError('mentorId', mentorId)
    }

    for (const developerId of developerIds) {
      this.assertReferenceExists('developerId', developerId)
    }

    // De-duplicated, because assigning the same developer twice is meaningless
    // and would produce two identical workbook rows.
    const unique = [...new Set(developerIds)]

    this.assignments = [
      ...this.assignments.filter((assignment) => assignment.mentorId !== mentorId),
      ...unique.map((developerId) => ({ mentorId, developerId })),
    ]

    return this.assignments
      .filter((assignment) => assignment.mentorId === mentorId)
      .map((assignment) => ({ ...assignment }))
  }

  async getProjects(): Promise<Project[]> {
    await this.simulateLatency()
    return this.projects.map((project) => ({ ...project }))
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    await this.simulateLatency()
    this.assertProjectReferences(request)

    const project = this.validate(
      projectSchema,
      { ...request, id: createSequentialId('PRJ', this.projects.map((row) => row.id)) },
      'Projects',
    )

    this.projects = [...this.projects, project]
    return { ...project }
  }

  async updateProject(id: string, request: UpdateProjectRequest): Promise<Project> {
    await this.simulateLatency()

    const index = this.projects.findIndex((candidate) => candidate.id === id)
    const existing = this.projects[index]
    if (existing === undefined) throw new RecordNotFoundError('Projects', id)

    const merged = { ...existing, ...request, id: existing.id }
    this.assertProjectReferences(merged)

    const project = this.validate(projectSchema, merged, 'Projects')
    this.projects = replaceAt(this.projects, index, project)
    return { ...project }
  }

  async deleteProject(id: string): Promise<void> {
    await this.simulateLatency()
    if (!this.projects.some((project) => project.id === id)) {
      throw new RecordNotFoundError('Projects', id)
    }

    this.assertNotInUse('Projects', id, [
      countLabel(this.tasks.filter((task) => task.projectId === id).length, 'task'),
      countLabel(this.entries.filter((entry) => entry.projectId === id).length, 'work entry'),
    ])

    this.projects = this.projects.filter((project) => project.id !== id)
  }

  async getTasks(query?: AssignedTaskQuery): Promise<AssignedTask[]> {
    await this.simulateLatency()
    return filterTasks(this.tasks, query).map((task) => ({ ...task }))
  }

  async getTaskById(id: string): Promise<AssignedTask | null> {
    await this.simulateLatency()
    const task = this.tasks.find((candidate) => candidate.id === id)
    return task === undefined ? null : { ...task }
  }

  async createTask(request: CreateAssignedTaskRequest): Promise<AssignedTask> {
    await this.simulateLatency()
    this.assertTaskReferences(request)

    const task = this.validate(
      assignedTaskSchema,
      {
        ...request,
        id: createSequentialId('TSK', this.tasks.map((row) => row.id)),
        updatedAt: new Date().toISOString(),
      },
      'Tasks',
    )

    this.tasks = [...this.tasks, task]
    return { ...task }
  }

  async updateTask(id: string, request: UpdateAssignedTaskRequest): Promise<AssignedTask> {
    await this.simulateLatency()

    const index = this.tasks.findIndex((candidate) => candidate.id === id)
    const existing = this.tasks[index]
    if (existing === undefined) throw new RecordNotFoundError('Tasks', id)

    const merged = { ...existing, ...request, id: existing.id, updatedAt: new Date().toISOString() }
    this.assertTaskReferences(merged)

    const task = this.validate(assignedTaskSchema, merged, 'Tasks')
    this.tasks = replaceAt(this.tasks, index, task)
    return { ...task }
  }

  async deleteTask(id: string): Promise<void> {
    await this.simulateLatency()

    const remaining = this.tasks.filter((task) => task.id !== id)
    if (remaining.length === this.tasks.length) throw new RecordNotFoundError('Tasks', id)
    this.tasks = remaining
  }

  async getComments(query?: MentorCommentQuery): Promise<MentorComment[]> {
    await this.simulateLatency()
    return filterComments(this.comments, query).map((comment) => ({ ...comment }))
  }

  async createComment(request: CreateMentorCommentRequest): Promise<MentorComment> {
    await this.simulateLatency()
    this.assertCommentReferences(request)

    const now = new Date().toISOString()
    const comment = this.validate(
      mentorCommentSchema,
      {
        ...request,
        id: createSequentialId('CMT', this.comments.map((row) => row.id)),
        createdAt: now,
        updatedAt: now,
      },
      'Comments',
    )

    this.comments = [...this.comments, comment]
    return { ...comment }
  }

  async updateComment(
    id: string,
    request: UpdateMentorCommentRequest,
  ): Promise<MentorComment> {
    await this.simulateLatency()

    const index = this.comments.findIndex((candidate) => candidate.id === id)
    const existing = this.comments[index]
    if (existing === undefined) throw new RecordNotFoundError('Comments', id)

    const merged = {
      ...existing,
      ...request,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }
    this.assertCommentReferences(merged)

    const comment = this.validate(mentorCommentSchema, merged, 'Comments')
    this.comments = replaceAt(this.comments, index, comment)
    return { ...comment }
  }

  async deleteComment(id: string): Promise<void> {
    await this.simulateLatency()

    const remaining = this.comments.filter((comment) => comment.id !== id)
    if (remaining.length === this.comments.length) throw new RecordNotFoundError('Comments', id)
    this.comments = remaining
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
    this.assertReferenceExists('developerId', request.developerId)
    this.assertReferenceExists('projectId', request.projectId)

    const now = new Date().toISOString()
    const entry = this.validate(
      dailyWorkEntrySchema,
      { ...request, id: createDailyWorkEntryId(), createdAt: now, updatedAt: now },
      'DailyWork',
    )

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

    this.assertReferenceExists('developerId', request.developerId ?? existing.developerId)
    this.assertReferenceExists('projectId', request.projectId ?? existing.projectId)

    const entry = this.validate(
      dailyWorkEntrySchema,
      {
        ...existing,
        ...request,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      },
      'DailyWork',
    )

    this.entries = replaceAt(this.entries, index, entry)
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

  /**
   * Runs a candidate through the same schema the workbook rows use.
   *
   * Writes are validated with the read schema on purpose: it guarantees that
   * anything saved here could be read back, so the mock can never accept a
   * record the real workbook would reject.
   */
  private validate<TValue>(
    schema: z.ZodType<TValue>,
    candidate: unknown,
    table: DataSourceTable,
  ): TValue {
    const result = schema.safeParse(candidate)
    if (!result.success) {
      throw new RowValidationError(table, [
        { index: 0, messages: describeZodIssues(result.error) },
      ])
    }

    return result.data
  }

  private assertReferenceExists(field: ReferenceField, value: string): void {
    const exists =
      field === 'developerId'
        ? this.developers.some((developer) => developer.id === value)
        : field === 'projectId'
          ? this.projects.some((project) => project.id === value)
          : this.mentors.some((mentor) => mentor.id === value)

    if (!exists) throw new ReferentialIntegrityError(field, value)
  }

  private assertProjectReferences(project: {
    mentorId?: string
    assignedDeveloperIds: readonly string[]
  }): void {
    if (project.mentorId !== undefined) this.assertReferenceExists('mentorId', project.mentorId)
    for (const developerId of project.assignedDeveloperIds) {
      this.assertReferenceExists('developerId', developerId)
    }
  }

  private assertTaskReferences(task: {
    developerId: string
    projectId: string
    mentorId?: string
  }): void {
    this.assertReferenceExists('developerId', task.developerId)
    this.assertReferenceExists('projectId', task.projectId)
    if (task.mentorId !== undefined) this.assertReferenceExists('mentorId', task.mentorId)
  }

  private assertCommentReferences(comment: {
    developerId: string
    mentorId: string
    projectId?: string
  }): void {
    this.assertReferenceExists('developerId', comment.developerId)
    this.assertReferenceExists('mentorId', comment.mentorId)
    if (comment.projectId !== undefined) this.assertReferenceExists('projectId', comment.projectId)
  }

  private assertNotInUse(
    table: DataSourceTable,
    recordId: string,
    dependents: readonly (string | null)[],
  ): void {
    const blocking = dependents.filter((entry): entry is string => entry !== null)
    if (blocking.length > 0) throw new RecordInUseError(table, recordId, blocking)
  }

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs <= 0) return
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
  }
}

function replaceAt<TValue>(values: readonly TValue[], index: number, value: TValue): TValue[] {
  const next = [...values]
  next[index] = value
  return next
}

/** `null` when the count is zero, so callers can drop non-blocking dependents. */
function countLabel(count: number, noun: string): string | null {
  if (count === 0) return null
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`
}

function omitMentor(task: AssignedTask): AssignedTask {
  const { mentorId: _removed, ...rest } = task
  return rest
}
