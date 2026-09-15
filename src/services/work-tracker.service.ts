import type {
  AssignedTask,
  AssignedTaskQuery,
  AppUser,
  CommentAuthorRole,
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

import { getDataProvider } from './data-provider/index'
import type { DataProvider, DataProviderCapabilities } from './data-provider/index'
import type { AccessScope } from './auth/access-scope'
import {
  canViewDeveloper,
  describeScope,
  filterByScope,
  restrictDeveloperIds,
} from './auth/access-scope'
import { isAdmin } from './auth/permissions'
import type { DateRange } from '@utils/date.utils'
import { getWeekRange, todayIsoDate, toNearestWorkingDay } from '@utils/date.utils'
import type { DailyTrendPoint, StatusBreakdown } from '@utils/work-summary.utils'
import {
  buildDailyTrend,
  calculateCompletionRate,
  findBlockedEntries,
  findDevelopersMissingUpdate,
  findDevelopersWithUpdate,
  sumHoursLogged,
  summariseStatuses,
} from '@utils/work-summary.utils'
import { sortByMostRecent } from '@utils/task.utils'

export interface DailyWorkEntryView extends DailyWorkEntry {
  developerName: string
  projectName: string
  client?: string
}

export interface AssignedTaskView extends AssignedTask {
  developerName: string
  projectName: string
  mentorName?: string

  isOverdue: boolean
}

export interface MentorCommentView extends MentorComment {
  developerName: string

  /** Who wrote the entry, and in what capacity the trail should label them. */
  authorName: string
  authorRole: CommentAuthorRole

  /** Absent on a developer's own reply, which is attributed to nobody. */
  mentorName?: string

  projectName?: string

  /** Absent when feedback predates task link or the task was deleted. */
  taskName?: string
}

export interface DayOverview {
  date: string
  entries: DailyWorkEntryView[]
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  developersUpdated: Developer[]
  developersMissingUpdate: Developer[]
  blockedEntries: DailyWorkEntryView[]
}

export interface RangeOverview {
  range: DateRange
  entries: DailyWorkEntryView[]
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  trend: DailyTrendPoint[]
  blockedEntries: DailyWorkEntryView[]
}

/** Applies access scope to person-specific reads; screens call this, not the provider. */
export class WorkTrackerService {
  private readonly provider: DataProvider

  /** Brief memo of roster lookups; cleared by forgetLookups after roster writes. */
  private readonly developerLookup: ShortLivedRead<Developer>
  private readonly projectLookup: ShortLivedRead<Project>
  private readonly mentorLookup: ShortLivedRead<Mentor>

  private readonly scopedProjectLookup = new ShortLivedReadByKey<Project>()

  constructor(provider: DataProvider) {
    this.provider = provider

    this.developerLookup = new ShortLivedRead(() => provider.getDevelopers())
    this.projectLookup = new ShortLivedRead(() => provider.getProjects())
    this.mentorLookup = new ShortLivedRead(() => provider.getMentors())
  }

  forgetLookups(): void {
    this.developerLookup.forget()
    this.projectLookup.forget()
    this.mentorLookup.forget()
    this.scopedProjectLookup.forget()
  }

  get capabilities(): DataProviderCapabilities {
    return this.provider.capabilities
  }

  async getDevelopers(scope: AccessScope): Promise<Developer[]> {
    const developers = await this.developerLookup.get()

    return developers.filter(
      (developer) => onTheRoster(developer) && canViewDeveloper(scope, developer.id),
    )
  }

  async getActiveDevelopers(scope: AccessScope): Promise<Developer[]> {
    const developers = await this.getDevelopers(scope)
    return developers.filter((developer) => developer.active)
  }

  /** Full roster for management screens; falls back to scoped list when readsRoster is false. */
  async getRosterDevelopers(scope: AccessScope): Promise<Developer[]> {
    if (!scope.readsRoster) return this.getDevelopers(scope)

    const developers = await this.developerLookup.get()
    return developers.filter(onTheRoster)
  }

  async getRosterMentors(scope: AccessScope): Promise<Mentor[]> {
    if (!scope.readsRoster) return this.getMentors(scope)

    const mentors = await this.mentorLookup.get()
    return mentors.filter(onTheRoster)
  }

  async getRosterProjects(scope: AccessScope): Promise<Project[]> {
    if (!scope.readsRoster) return this.getProjects(scope)

    const projects = await this.projectLookup.get()
    return projects.filter(onTheRoster)
  }

  async getActiveRosterProjects(scope: AccessScope): Promise<Project[]> {
    const projects = await this.getRosterProjects(scope)
    return projects.filter((project) => project.active)
  }

  /** Returns null for out-of-scope or soft-deleted records. */
  async getDeveloperById(scope: AccessScope, id: string): Promise<Developer | null> {
    if (!canViewDeveloper(scope, id)) return null

    const developers = await this.developerLookup.get()
    const developer = developers.find((candidate) => candidate.id === id)

    return developer !== undefined && onTheRoster(developer) ? developer : null
  }

  async getMentors(scope: AccessScope): Promise<Mentor[]> {
    const mentors = (await this.mentorLookup.get()).filter(onTheRoster)
    if (scope.visibleDeveloperIds === null) return mentors

    if (scope.role === 'mentor') {
      return mentors.filter((mentor) => mentor.id === scope.mentorId)
    }

    const assignments = await this.provider.getMentorAssignments()
    const mentorIds = new Set(
      assignments
        .filter((assignment) => canViewDeveloper(scope, assignment.developerId))
        .map((assignment) => assignment.mentorId),
    )

    return mentors.filter((mentor) => mentorIds.has(mentor.id))
  }

  /** Takes AppUser, not AccessScope, because scope is built from these rows. */
  async getMentorAssignments(user: AppUser | null): Promise<MentorAssignment[]> {
    if (user === null) return []

    const assignments = await this.provider.getMentorAssignments()
    if (isAdmin(user)) return assignments

    if (user.role === 'mentor') {
      return assignments.filter((assignment) => assignment.mentorId === user.mentorId)
    }

    return assignments.filter((assignment) => assignment.developerId === user.developerId)
  }

  /** Project involvement is derived from tasks and entries; memoised per scope because it is expensive. */
  getProjects(scope: AccessScope): Promise<Project[]> {
    return this.scopedProjectLookup.get(describeScope(scope), () =>
      this.readInvolvedProjects(scope),
    )
  }

  private async readInvolvedProjects(scope: AccessScope): Promise<Project[]> {
    const projects = (await this.projectLookup.get()).filter(onTheRoster)
    if (scope.visibleDeveloperIds === null) return projects

    const visibleIds = scope.visibleDeveloperIds
    const [tasks, entries] = await Promise.all([
      this.provider.getTasks({ developerIds: visibleIds }),
      this.provider.getDailyWorkEntries({ developerIds: visibleIds }),
    ])

    const involved = new Set<string>([
      ...filterByScope(scope, tasks).map((task) => task.projectId),
      ...filterByScope(scope, entries).map((entry) => entry.projectId),
    ])

    return projects.filter(
      (project) =>
        involved.has(project.id) ||
        project.assignedDeveloperIds.some((id) => visibleIds.includes(id)),
    )
  }

  async getActiveProjects(scope: AccessScope): Promise<Project[]> {
    const projects = await this.getProjects(scope)
    return projects.filter((project) => project.active)
  }

  async getDailyWorkEntryViews(
    scope: AccessScope,
    query?: DailyWorkQuery,
  ): Promise<DailyWorkEntryView[]> {
    const entries = await this.readScopedEntries(scope, query)
    return this.decorateEntries(entries)
  }

  async getDailyWorkEntryById(
    scope: AccessScope,
    id: string,
  ): Promise<DailyWorkEntry | null> {
    const entry = await this.provider.getDailyWorkEntryById(id)
    if (entry === null || !canViewDeveloper(scope, entry.developerId)) return null
    return entry
  }

  async getTaskViews(
    scope: AccessScope,
    query?: AssignedTaskQuery,
  ): Promise<AssignedTaskView[]> {
    const effectiveIds = restrictDeveloperIds(scope, query?.developerIds)

    const [tasks, developers, projects, mentors] = await Promise.all([
      this.provider.getTasks({ ...query, ...withDeveloperIds(effectiveIds) }),
      this.developerLookup.get(),
      this.projectLookup.get(),
      this.mentorLookup.get(),
    ])

    const today = todayIsoDate()

    return narrowToDevelopers(effectiveIds, tasks).map((task) =>
      this.toTaskView(task, { developers, mentors, projects }, today),
    )
  }

  /** Returns null for an out-of-scope, deleted or missing task. */
  async getTaskViewById(scope: AccessScope, id: string): Promise<AssignedTaskView | null> {
    const task = await this.provider.getTaskById(id)
    if (task === null || !canViewDeveloper(scope, task.developerId)) return null

    const [developers, projects, mentors] = await Promise.all([
      this.developerLookup.get(),
      this.projectLookup.get(),
      this.mentorLookup.get(),
    ])

    return this.toTaskView(task, { developers, mentors, projects }, todayIsoDate())
  }

  private toTaskView(
    task: AssignedTask,
    roster: { developers: readonly Developer[]; mentors: readonly Mentor[]; projects: readonly Project[] },
    today: string,
  ): AssignedTaskView {
    const mentor = roster.mentors.find((candidate) => candidate.id === task.mentorId)

    return {
      ...task,
      developerName: resolveName(roster.developers, task.developerId, 'developer'),
      projectName: resolveName(roster.projects, task.projectId, 'project'),
      ...(mentor === undefined ? {} : { mentorName: mentor.name }),
      isOverdue: task.status !== 'completed' && task.dueDate !== undefined && task.dueDate < today,
    }
  }

  async getCommentViews(
    scope: AccessScope,
    query?: MentorCommentQuery,
  ): Promise<MentorCommentView[]> {
    const effectiveIds = restrictDeveloperIds(scope, query?.developerIds)

    const [comments, developers, projects, mentors, tasks] = await Promise.all([
      this.provider.getComments({ ...query, ...withDeveloperIds(effectiveIds) }),
      this.developerLookup.get(),
      this.projectLookup.get(),
      this.mentorLookup.get(),
      this.provider.getTasks({ ...withDeveloperIds(effectiveIds) }),
    ])

    return narrowToDevelopers(effectiveIds, comments)
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((comment) => {
        const project = projects.find((candidate) => candidate.id === comment.projectId)
        const task = tasks.find((candidate) => candidate.id === comment.taskId)
        const mentor = mentors.find((candidate) => candidate.id === comment.mentorId)
        const authorRole = comment.authorRole ?? 'mentor'

        return {
          ...comment,
          authorRole,
          authorName: resolveAuthorName(comment, authorRole, developers, mentors),
          developerName: resolveName(developers, comment.developerId, 'developer'),
          ...(mentor === undefined ? {} : { mentorName: mentor.name }),
          ...(project === undefined ? {} : { projectName: project.name }),
          ...(task === undefined ? {} : { taskName: task.name }),
        }
      })
  }

  createDeveloper(request: CreateDeveloperRequest): Promise<Developer> {
    return this.provider.createDeveloper(request)
  }

  updateDeveloper(id: string, request: UpdateDeveloperRequest): Promise<Developer> {
    return this.provider.updateDeveloper(id, request)
  }

  deleteDeveloper(id: string): Promise<void> {
    return this.provider.deleteDeveloper(id)
  }

  createMentor(request: CreateMentorRequest): Promise<Mentor> {
    return this.provider.createMentor(request)
  }

  updateMentor(id: string, request: UpdateMentorRequest): Promise<Mentor> {
    return this.provider.updateMentor(id, request)
  }

  deleteMentor(id: string): Promise<void> {
    return this.provider.deleteMentor(id)
  }

  setMentorAssignments(
    mentorId: string,
    developerIds: readonly string[],
  ): Promise<MentorAssignment[]> {
    return this.provider.setMentorAssignments(mentorId, developerIds)
  }

  createProject(request: CreateProjectRequest): Promise<Project> {
    return this.provider.createProject(request)
  }

  updateProject(id: string, request: UpdateProjectRequest): Promise<Project> {
    return this.provider.updateProject(id, request)
  }

  deleteProject(id: string): Promise<void> {
    return this.provider.deleteProject(id)
  }

  createTask(request: CreateAssignedTaskRequest): Promise<AssignedTask> {
    return this.provider.createTask(request)
  }

  updateTask(id: string, request: UpdateAssignedTaskRequest): Promise<AssignedTask> {
    return this.provider.updateTask(id, request)
  }

  deleteTask(id: string): Promise<void> {
    return this.provider.deleteTask(id)
  }

  createComment(request: CreateMentorCommentRequest): Promise<MentorComment> {
    return this.provider.createComment(request)
  }

  updateComment(id: string, request: UpdateMentorCommentRequest): Promise<MentorComment> {
    return this.provider.updateComment(id, request)
  }

  deleteComment(id: string): Promise<void> {
    return this.provider.deleteComment(id)
  }

  createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry> {
    return this.provider.createDailyWorkEntry(request)
  }

  updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry> {
    return this.provider.updateDailyWorkEntry(id, request)
  }

  deleteDailyWorkEntry(id: string): Promise<void> {
    return this.provider.deleteDailyWorkEntry(id)
  }

  async getDayOverview(scope: AccessScope, isoDate: string): Promise<DayOverview> {
    const entries = await this.readScopedEntries(scope, { dateFrom: isoDate, dateTo: isoDate })

    const [views, developers] = await Promise.all([
      this.decorateEntries(entries),
      this.getDevelopers(scope),
    ])

    return {
      date: isoDate,
      entries: views,
      statuses: summariseStatuses(entries),
      completionRate: calculateCompletionRate(entries),
      hoursLogged: sumHoursLogged(entries),
      developersUpdated: findDevelopersWithUpdate(developers, entries, isoDate),
      developersMissingUpdate: findDevelopersMissingUpdate(developers, entries, isoDate),
      blockedEntries: findBlockedEntries(views),
    }
  }

  async getRangeOverview(scope: AccessScope, range: DateRange): Promise<RangeOverview> {
    const entries = await this.readScopedEntries(scope, {
      dateFrom: range.from,
      dateTo: range.to,
    })
    const views = await this.decorateEntries(entries)

    return {
      range,
      entries: views,
      statuses: summariseStatuses(entries),
      completionRate: calculateCompletionRate(entries),
      hoursLogged: sumHoursLogged(entries),
      trend: buildDailyTrend(entries, range),
      blockedEntries: findBlockedEntries(views),
    }
  }

  getWeekOverview(scope: AccessScope, isoDate: string): Promise<RangeOverview> {
    return this.getRangeOverview(scope, getWeekRange(isoDate))
  }

  /** Falls back to the previous working day so weekend dashboards are not empty. */
  getWorkingDayOverview(scope: AccessScope, isoDate: string): Promise<DayOverview> {
    return this.getDayOverview(scope, toNearestWorkingDay(isoDate))
  }

  /** Passes developerIds to the provider and re-filters in memory. */
  private async readScopedEntries(
    scope: AccessScope,
    query?: DailyWorkQuery,
  ): Promise<DailyWorkEntry[]> {
    const effectiveIds = restrictDeveloperIds(scope, query?.developerIds)
    const entries = await this.provider.getDailyWorkEntries({
      ...query,
      ...withDeveloperIds(effectiveIds),
    })

    return narrowToDevelopers(effectiveIds, entries)
  }

  private async decorateEntries(
    entries: readonly DailyWorkEntry[],
  ): Promise<DailyWorkEntryView[]> {
    const [developers, projects] = await Promise.all([
      this.developerLookup.get(),
      this.projectLookup.get(),
    ])

    return sortByMostRecent(entries).map((entry) => {
      const project = projects.find((candidate) => candidate.id === entry.projectId)

      return {
        ...entry,
        developerName: resolveName(developers, entry.developerId, 'developer'),
        projectName: resolveName(projects, entry.projectId, 'project'),
        ...(project?.client === undefined ? {} : { client: project.client }),
      }
    })
  }
}

/** Omits developerIds key when unrestricted; explicit undefined would look like an empty filter. */
function withDeveloperIds(
  developerIds: readonly string[] | undefined,
): { developerIds?: readonly string[] } {
  return developerIds === undefined ? {} : { developerIds }
}

/** Re-filters by developer in memory even when the provider accepts developerIds. */
function narrowToDevelopers<TRecord extends { developerId: string }>(
  effectiveIds: readonly string[] | undefined,
  records: readonly TRecord[],
): TRecord[] {
  if (effectiveIds === undefined) return [...records]
  return records.filter((record) => effectiveIds.includes(record.developerId))
}

/** Soft-deleted roster rows stay in lookups for resolveName but are filtered from lists. */
function onTheRoster(record: { deletedAt?: string }): boolean {
  return record.deletedAt === undefined
}

/**
 * Names the author of a comment.
 *
 * Resolved through the login behind the entry first, so somebody who holds both
 * a mentor and an employee record is named once, whichever capacity they wrote
 * in. Older entries carry no author, and fall back to the mentor they name.
 */
function resolveAuthorName(
  comment: MentorComment,
  role: CommentAuthorRole,
  developers: readonly Developer[],
  mentors: readonly Mentor[],
): string {
  if (comment.authorProfileId !== undefined) {
    const author =
      mentors.find((candidate) => candidate.profileId === comment.authorProfileId) ??
      developers.find((candidate) => candidate.profileId === comment.authorProfileId)

    if (author !== undefined) return author.name
  }

  if (role === 'developer') return resolveName(developers, comment.developerId, 'developer')
  if (comment.mentorId !== undefined) return resolveName(mentors, comment.mentorId, 'mentor')

  return role === 'admin' ? 'Administrator' : 'Unknown mentor'
}

/** Uses unfiltered lookups so deleted roster members still show names on historical work. */
function resolveName(
  records: readonly { id: string; name: string }[],
  id: string | undefined,
  label: string,
): string {
  if (id === undefined) return `Unknown ${label}`
  return records.find((record) => record.id === id)?.name ?? `Unknown (${id})`
}

const LOOKUP_TTL_MS = 2_000

/** Shares one in-flight read per table for ~2s; callers get a copied array. */
class ShortLivedRead<TRow> {
  private entry: { readAt: number; rows: Promise<readonly TRow[]> } | null = null

  private readonly read: () => Promise<TRow[]>

  constructor(read: () => Promise<TRow[]>) {
    this.read = read
  }

  get(): Promise<TRow[]> {
    const now = Date.now()

    if (this.entry === null || now - this.entry.readAt >= LOOKUP_TTL_MS) {
      const rows = this.read()
      const entry = { readAt: now, rows }
      this.entry = entry

      void rows.catch(() => {
        if (this.entry === entry) this.entry = null
      })
    }

    return this.entry.rows.then((rows) => [...rows])
  }

  forget(): void {
    this.entry = null
  }
}

/** Per-scope memo for reads whose answer depends on access scope. */
class ShortLivedReadByKey<TRow> {
  private readonly reads = new Map<string, ShortLivedRead<TRow>>()

  get(key: string, read: () => Promise<TRow[]>): Promise<TRow[]> {
    const existing = this.reads.get(key)
    if (existing !== undefined) return existing.get()

    const created = new ShortLivedRead(read)
    this.reads.set(key, created)
    return created.get()
  }

  forget(): void {
    this.reads.clear()
  }
}

let cachedService: WorkTrackerService | undefined

export function getWorkTrackerService(): WorkTrackerService {
  cachedService ??= new WorkTrackerService(getDataProvider())
  return cachedService
}
