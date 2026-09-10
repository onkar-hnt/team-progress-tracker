import type {
  AssignedTask,
  AssignedTaskQuery,
  AppUser,
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
import { canViewDeveloper, filterByScope, restrictDeveloperIds } from './auth/access-scope'
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

/**
 * An entry with its lookups resolved, ready for tables and cards.
 *
 * Ids remain on the object so that navigation and filtering keep using keys;
 * the added names are for display only.
 */
export interface DailyWorkEntryView extends DailyWorkEntry {
  developerName: string
  projectName: string
  client?: string
}

export interface AssignedTaskView extends AssignedTask {
  developerName: string
  projectName: string
  mentorName?: string

  /** Past its due date and not yet completed. */
  isOverdue: boolean
}

export interface MentorCommentView extends MentorComment {
  developerName: string
  mentorName: string
  projectName?: string
}

/** Everything the dashboard needs for a single selected day. */
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

/** Everything the dashboard needs for a period such as a week. */
export interface RangeOverview {
  range: DateRange
  entries: DailyWorkEntryView[]
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  trend: DailyTrendPoint[]
  blockedEntries: DailyWorkEntryView[]
}

/**
 * Application-facing data service.
 *
 * Features talk to this class, never to a provider. It owns the work that is
 * independent of storage: resolving names, assembling the composite views
 * screens need, and applying business rules such as "only active developers
 * can be missing an update".
 *
 * It also applies the access scope. Every method that can return
 * person-specific data takes an `AccessScope` and narrows its result to it, so
 * a screen cannot read outside the signed-in person's permissions even by
 * mistake. Methods that take no scope return only data that is safe for
 * anybody signed in.
 *
 * Because it depends on `DataProvider` rather than a concrete backend, moving
 * from mock data to SharePoint, and later to an API, changes nothing here.
 */
export class WorkTrackerService {
  private readonly provider: DataProvider

  constructor(provider: DataProvider) {
    this.provider = provider
  }

  get capabilities(): DataProviderCapabilities {
    return this.provider.capabilities
  }

  /** Employees the signed-in person may see. */
  async getDevelopers(scope: AccessScope): Promise<Developer[]> {
    const developers = await this.provider.getDevelopers()
    return developers.filter((developer) => canViewDeveloper(scope, developer.id))
  }

  async getActiveDevelopers(scope: AccessScope): Promise<Developer[]> {
    const developers = await this.getDevelopers(scope)
    return developers.filter((developer) => developer.active)
  }

  /** `null` when the id does not exist *or* is out of scope, which are the same answer to the caller. */
  async getDeveloperById(scope: AccessScope, id: string): Promise<Developer | null> {
    if (!canViewDeveloper(scope, id)) return null

    const developers = await this.provider.getDevelopers()
    return developers.find((developer) => developer.id === id) ?? null
  }

  /**
   * Mentors relevant to the signed-in person.
   *
   * An admin sees the full list. A mentor sees their own row. A developer sees
   * whoever mentors them, so their feedback can be attributed, and nobody
   * else's mentor.
   */
  async getMentors(scope: AccessScope): Promise<Mentor[]> {
    const mentors = await this.provider.getMentors()
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

  /**
   * Mentor mapping rows visible to `user`.
   *
   * Takes a user rather than a scope because this is what the scope is built
   * from, and so it cannot depend on it. An admin sees the whole mapping, a
   * mentor sees their own assignments, and a developer sees only the row that
   * names their own mentor.
   */
  async getMentorAssignments(user: AppUser | null): Promise<MentorAssignment[]> {
    if (user === null) return []

    const assignments = await this.provider.getMentorAssignments()
    if (isAdmin(user)) return assignments

    if (user.role === 'mentor') {
      return assignments.filter((assignment) => assignment.mentorId === user.mentorId)
    }

    return assignments.filter((assignment) => assignment.developerId === user.developerId)
  }

  /**
   * Projects the signed-in person is involved in.
   *
   * Involvement means assigned to the project, or having a task or a work
   * entry on it. Derived rather than taken from the assignment column alone,
   * because work often lands on a project before the column is updated, and a
   * developer must still see the project their own task belongs to.
   */
  async getProjects(scope: AccessScope): Promise<Project[]> {
    const projects = await this.provider.getProjects()
    if (scope.visibleDeveloperIds === null) return projects

    const visibleIds = scope.visibleDeveloperIds
    const [tasks, entries] = await Promise.all([
      this.provider.getTasks({ developerIds: visibleIds }),
      this.provider.getDailyWorkEntries({ developerIds: visibleIds }),
    ])

    const involved = new Set<string>([
      ...tasks.map((task) => task.projectId),
      ...entries.map((entry) => entry.projectId),
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

  /** Entries with names resolved, newest first, narrowed to `scope`. */
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
    const scopedQuery: AssignedTaskQuery = {
      ...query,
      ...withDeveloperIds(restrictDeveloperIds(scope, query?.developerIds)),
    }

    const [tasks, developers, projects, mentors] = await Promise.all([
      this.provider.getTasks(scopedQuery),
      this.provider.getDevelopers(),
      this.provider.getProjects(),
      this.provider.getMentors(),
    ])

    // Filtered again after the query: a provider is free to satisfy filters
    // however it likes, and this layer must not depend on it having honoured
    // the developer predicate.
    const today = todayIsoDate()

    return filterByScope(scope, tasks).map((task) => {
      const mentor = mentors.find((candidate) => candidate.id === task.mentorId)

      return {
        ...task,
        developerName: resolveName(developers, task.developerId, 'developer'),
        projectName: resolveName(projects, task.projectId, 'project'),
        ...(mentor === undefined ? {} : { mentorName: mentor.name }),
        isOverdue:
          task.status !== 'completed' && task.dueDate !== undefined && task.dueDate < today,
      }
    })
  }

  async getCommentViews(
    scope: AccessScope,
    query?: MentorCommentQuery,
  ): Promise<MentorCommentView[]> {
    const scopedQuery: MentorCommentQuery = {
      ...query,
      ...withDeveloperIds(restrictDeveloperIds(scope, query?.developerIds)),
    }

    const [comments, developers, projects, mentors] = await Promise.all([
      this.provider.getComments(scopedQuery),
      this.provider.getDevelopers(),
      this.provider.getProjects(),
      this.provider.getMentors(),
    ])

    return filterByScope(scope, comments)
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((comment) => {
        const project = projects.find((candidate) => candidate.id === comment.projectId)

        return {
          ...comment,
          developerName: resolveName(developers, comment.developerId, 'developer'),
          mentorName: resolveName(mentors, comment.mentorId, 'mentor'),
          ...(project === undefined ? {} : { projectName: project.name }),
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
    const views = await this.decorateEntries(entries)
    const developers = await this.getDevelopers(scope)

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

  /** Overview for the Monday-to-Sunday week containing `isoDate`. */
  getWeekOverview(scope: AccessScope, isoDate: string): Promise<RangeOverview> {
    return this.getRangeOverview(scope, getWeekRange(isoDate))
  }

  /**
   * Falls back to the previous working day so that opening the dashboard on a
   * Sunday shows Friday's work instead of an empty screen.
   */
  getWorkingDayOverview(scope: AccessScope, isoDate: string): Promise<DayOverview> {
    return this.getDayOverview(scope, toNearestWorkingDay(isoDate))
  }

  /**
   * Reads entries with the scope applied twice: once as a query predicate so
   * a capable backend can filter server-side, and once in memory so this
   * layer never depends on it having done so.
   */
  private async readScopedEntries(
    scope: AccessScope,
    query?: DailyWorkQuery,
  ): Promise<DailyWorkEntry[]> {
    const scopedQuery: DailyWorkQuery = {
      ...query,
      ...withDeveloperIds(restrictDeveloperIds(scope, query?.developerIds)),
    }

    const entries = await this.provider.getDailyWorkEntries(scopedQuery)
    return filterByScope(scope, entries)
  }

  private async decorateEntries(
    entries: readonly DailyWorkEntry[],
  ): Promise<DailyWorkEntryView[]> {
    const [developers, projects] = await Promise.all([
      this.provider.getDevelopers(),
      this.provider.getProjects(),
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

/**
 * Omits the key entirely for unrestricted access.
 *
 * Setting `developerIds: undefined` explicitly would still create the
 * property, and a provider checking `'developerIds' in query` would then see
 * a filter that matches nothing.
 */
function withDeveloperIds(
  developerIds: readonly string[] | undefined,
): { developerIds?: readonly string[] } {
  return developerIds === undefined ? {} : { developerIds }
}

/**
 * Resolves a display name, tolerating ids with no matching lookup row.
 *
 * A missing lookup is surfaced in the UI rather than hidden, because a blank
 * name would conceal the fact that the workbook has an orphaned row.
 */
function resolveName(
  records: readonly { id: string; name: string }[],
  id: string | undefined,
  label: string,
): string {
  if (id === undefined) return `Unknown ${label}`
  return records.find((record) => record.id === id)?.name ?? `Unknown (${id})`
}

let cachedService: WorkTrackerService | undefined

export function getWorkTrackerService(): WorkTrackerService {
  cachedService ??= new WorkTrackerService(getDataProvider())
  return cachedService
}
