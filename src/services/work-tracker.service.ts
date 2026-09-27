import type {
  AssignedTask,
  AssignedTaskQuery,
  AppUser,
  CreateAssignedTaskRequest,
  CreateDailyWorkEntryRequest,
  CreateDeveloperRequest,
  CreateLeaveDayRequest,
  CreateMentorCommentRequest,
  CreateMentorRequest,
  CreateProjectRequest,
  DailyWorkEntry,
  DailyWorkQuery,
  Developer,
  LeaveDay,
  LeaveDayQuery,
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

import { DataSourceUnavailableError, getDataProvider } from './data-provider/index'
import type { DataProvider, DataProviderCapabilities } from './data-provider/index'
import type { AccessScope } from './auth/access-scope'
import {
  canViewDeveloper,
  canViewDeveloperProject,
  describeScope,
  filterByScope,
  restrictDeveloperIds,
} from './auth/access-scope'
import { isAdmin } from './auth/permissions'
import { ShortLivedRead, ShortLivedReadByKey } from './short-lived-read'
import {
  buildDailyWorkReadQuery,
  idsForRead,
  narrowToDevelopers,
  projectIdsForRead,
  withDeveloperIds,
  withProjectIds,
} from './work-tracker.read-query'
import { onTheRoster, resolveAuthorName, resolveName } from './work-tracker.names'
import type {
  AssignedTaskView,
  DailyWorkEntryView,
  DayOverview,
  MentorCommentView,
  RangeOverview,
} from './work-tracker.views'
import type { DateRange } from '@utils/date.utils'
import { getWeekRange, todayIsoDate, toNearestWorkingDay } from '@utils/date.utils'
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
import type { UpdateCoverage } from '@utils/update-coverage.utils'
import { buildUpdateCoverage } from '@utils/update-coverage.utils'

/**
 * Matches the roster staleTime the query hooks use.
 *
 * Every write that changes these tables calls `forgetLookups`, so the age of
 * the memo only delays a change somebody else made, which the refresh control
 * clears. At two seconds it expired between one filter change and the next, and
 * a list of work could not be named without reading the roster again first.
 */
const LOOKUP_TTL_MS = 5 * 60_000

/** Applies access scope to person-specific reads; screens call this, not the provider. */
export class WorkTrackerService {
  private readonly provider: DataProvider

  /** Memo of roster lookups; cleared by forgetLookups after roster writes. */
  private readonly developerLookup: ShortLivedRead<Developer>
  private readonly projectLookup: ShortLivedRead<Project>
  private readonly mentorLookup: ShortLivedRead<Mentor>

  private readonly scopedProjectLookup = new ShortLivedReadByKey<Project>(LOOKUP_TTL_MS)

  constructor(provider: DataProvider) {
    this.provider = provider

    this.developerLookup = new ShortLivedRead(() => provider.getDevelopers(), LOOKUP_TTL_MS)
    this.projectLookup = new ShortLivedRead(() => provider.getProjects(), LOOKUP_TTL_MS)
    this.mentorLookup = new ShortLivedRead(() => provider.getMentors(), LOOKUP_TTL_MS)
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
    if (scope.visibleDeveloperIds === null && scope.visibleProjectIds === null) return projects

    if (scope.visibleProjectIds !== null) {
      const ownId = scope.developerId
      return projects.filter(
        (project) =>
          scope.visibleProjectIds?.includes(project.id) === true ||
          (ownId !== undefined && project.assignedDeveloperIds.includes(ownId)),
      )
    }

    const visibleIds = scope.visibleDeveloperIds ?? []
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
    if (entry === null || !canViewDeveloperProject(scope, entry.developerId, entry.projectId)) {
      return null
    }
    return entry
  }

  async getTaskViews(
    scope: AccessScope,
    query?: AssignedTaskQuery,
  ): Promise<AssignedTaskView[]> {
    const effectiveIds = idsForRead(
      query?.developerIds,
      restrictDeveloperIds(scope, query?.developerIds),
    )
    const projectIds = idsForRead(query?.projectIds, projectIdsForRead(scope, query?.projectIds))

    const [tasks, developers, projects, mentors] = await Promise.all([
      this.provider.getTasks({
        ...query,
        ...withDeveloperIds(effectiveIds),
        ...withProjectIds(projectIds),
      }),
      this.developerLookup.get(),
      this.projectLookup.get(),
      this.mentorLookup.get(),
    ])

    const today = todayIsoDate()

    return filterByScope(scope, narrowToDevelopers(effectiveIds, tasks)).map((task) =>
      this.toTaskView(task, { developers, mentors, projects }, today),
    )
  }

  /** Returns null for an out-of-scope, deleted or missing task. */
  async getTaskViewById(scope: AccessScope, id: string): Promise<AssignedTaskView | null> {
    const task = await this.provider.getTaskById(id)
    if (task === null || !canViewDeveloperProject(scope, task.developerId, task.projectId)) {
      return null
    }

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
    const effectiveIds = idsForRead(
      query?.developerIds,
      restrictDeveloperIds(scope, query?.developerIds),
    )
    const projectIds = idsForRead(query?.projectIds, projectIdsForRead(scope, query?.projectIds))

    const [comments, developers, projects, mentors, tasks] = await Promise.all([
      this.provider.getComments({
        ...query,
        ...withDeveloperIds(effectiveIds),
        ...withProjectIds(projectIds),
      }),
      this.developerLookup.get(),
      this.projectLookup.get(),
      this.mentorLookup.get(),
      this.provider.getTasks({ ...withDeveloperIds(effectiveIds) }),
    ])

    return filterByScope(scope, narrowToDevelopers(effectiveIds, comments))
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

  getResponsibleProjectIds(mentorId: string): Promise<string[]> {
    return this.provider.getResponsibleProjectIds(mentorId)
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

  async getLeaveDays(scope: AccessScope, query?: LeaveDayQuery): Promise<LeaveDay[]> {
    const requested = restrictDeveloperIds(scope, query?.developerIds)
    const effectiveIds = idsForRead(query?.developerIds, requested)

    if (effectiveIds !== undefined && effectiveIds.length === 0) return []

    const leaveDays = await this.provider.getLeaveDays({
      ...query,
      ...withDeveloperIds(effectiveIds),
    })

    return filterByScope(scope, narrowToDevelopers(effectiveIds, leaveDays))
  }

  createLeaveDay(request: CreateLeaveDayRequest): Promise<LeaveDay> {
    return this.provider.createLeaveDay(request)
  }

  clearLeaveDay(id: string): Promise<void> {
    return this.provider.deleteLeaveDay(id)
  }

  /**
   * Which working days in a range each visible developer has accounted for.
   *
   * Reads the three sets separately and joins them here rather than asking the
   * database for the gaps, because a gap is the absence of a row: there is
   * nothing to select, and the list of days that should exist is a calendar
   * question the client already answers for every other range screen.
   */
  async getUpdateCoverage(
    scope: AccessScope,
    range: DateRange,
    developerIds?: readonly string[],
  ): Promise<UpdateCoverage> {
    const forDevelopers = withDeveloperIds(developerIds)

    const [developers, entries, leaveDays] = await Promise.all([
      this.getDevelopers(scope),
      this.readScopedEntries(scope, {
        dateFrom: range.from,
        dateTo: range.to,
        ...forDevelopers,
      }),
      this.readLeaveDaysIfPresent(scope, range, developerIds),
    ])

    return buildUpdateCoverage({
      developers:
        developerIds === undefined
          ? developers
          : developers.filter((developer) => developerIds.includes(developer.id)),
      entries,
      leaveDays,
      range,
    })
  }

  async getDayOverview(scope: AccessScope, isoDate: string): Promise<DayOverview> {
    const entries = await this.readScopedEntries(scope, { dateFrom: isoDate, dateTo: isoDate })

    const [views, developers, leaveDays] = await Promise.all([
      this.decorateEntries(entries),
      this.getDevelopers(scope),
      this.readLeaveDaysIfPresent(scope, { from: isoDate, to: isoDate }),
    ])

    // A day off is not a day somebody failed to account for, so the two lists
    // are exclusive: whoever appears here is absent from the one below.
    const onLeave = new Set(leaveDays.map((leaveDay) => leaveDay.developerId))

    return {
      date: isoDate,
      entries: views,
      statuses: summariseStatuses(entries),
      completionRate: calculateCompletionRate(entries),
      hoursLogged: sumHoursLogged(entries),
      developersUpdated: findDevelopersWithUpdate(developers, entries, isoDate),
      developersMissingUpdate: findDevelopersMissingUpdate(developers, entries, isoDate).filter(
        (developer) => !onLeave.has(developer.id),
      ),
      developersOnLeave: developers.filter((developer) => onLeave.has(developer.id)),
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

  /**
   * Leave, for a screen that is about something else.
   *
   * The deploy carrying this code can land before the migration carrying the
   * table, and the dashboard is not the place to find that out: an overview
   * that failed for a missing leave table would take the whole screen with it.
   * Unavailable therefore means "no leave recorded", which is what every day
   * before this feature already meant. Anything else is a real fault and is
   * raised.
   */
  private async readLeaveDaysIfPresent(
    scope: AccessScope,
    range: DateRange,
    developerIds?: readonly string[],
  ): Promise<LeaveDay[]> {
    try {
      return await this.getLeaveDays(scope, {
        dateFrom: range.from,
        dateTo: range.to,
        ...withDeveloperIds(developerIds),
      })
    } catch (error) {
      if (error instanceof DataSourceUnavailableError) return []
      throw error
    }
  }

  /** Passes the caller's filters to the provider. RLS decides which rows come back. */
  private async readScopedEntries(
    scope: AccessScope,
    query?: DailyWorkQuery,
  ): Promise<DailyWorkEntry[]> {
    const readQuery = buildDailyWorkReadQuery(scope, query)
    const entries = await this.provider.getDailyWorkEntries(readQuery)

    return filterByScope(scope, entries)
  }

  private async decorateEntries(
    entries: readonly DailyWorkEntry[],
  ): Promise<DailyWorkEntryView[]> {
    const [developers, projects] = await Promise.all([
      this.developerLookup.get().catch(() => [] as Developer[]),
      this.projectLookup.get().catch(() => [] as Project[]),
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

let cachedService: WorkTrackerService | undefined

export function getWorkTrackerService(): WorkTrackerService {
  cachedService ??= new WorkTrackerService(getDataProvider())
  return cachedService
}
