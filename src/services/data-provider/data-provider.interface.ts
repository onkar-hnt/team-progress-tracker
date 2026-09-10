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
 * - enforce referential integrity, since a spreadsheet cannot
 *
 * Access control is deliberately *not* here. This layer answers "what does
 * the workbook contain"; who may see it is decided above, in `permissions.ts`.
 */
export interface DataProvider {
  /** Stable identifier used in diagnostics and error messages. */
  readonly name: string

  readonly capabilities: DataProviderCapabilities

  /** The Employees table: everyone who can sign in or be assigned work. */
  getDevelopers(): Promise<Developer[]>

  createDeveloper(request: CreateDeveloperRequest): Promise<Developer>

  updateDeveloper(id: string, request: UpdateDeveloperRequest): Promise<Developer>

  deleteDeveloper(id: string): Promise<void>

  getMentors(): Promise<Mentor[]>

  createMentor(request: CreateMentorRequest): Promise<Mentor>

  updateMentor(id: string, request: UpdateMentorRequest): Promise<Mentor>

  /** Also removes that mentor's assignments, which would otherwise dangle. */
  deleteMentor(id: string): Promise<void>

  getMentorAssignments(): Promise<MentorAssignment[]>

  /**
   * Replaces the whole set of developers assigned to one mentor.
   *
   * Set semantics rather than add/remove: the admin screen edits the list as
   * a whole, and replacing it makes the write idempotent instead of
   * depending on which rows already existed.
   */
  setMentorAssignments(mentorId: string, developerIds: readonly string[]): Promise<MentorAssignment[]>

  getProjects(): Promise<Project[]>

  createProject(request: CreateProjectRequest): Promise<Project>

  updateProject(id: string, request: UpdateProjectRequest): Promise<Project>

  deleteProject(id: string): Promise<void>

  /** Ordering is not guaranteed; callers that display data must sort explicitly. */
  getTasks(query?: AssignedTaskQuery): Promise<AssignedTask[]>

  getTaskById(id: string): Promise<AssignedTask | null>

  createTask(request: CreateAssignedTaskRequest): Promise<AssignedTask>

  updateTask(id: string, request: UpdateAssignedTaskRequest): Promise<AssignedTask>

  deleteTask(id: string): Promise<void>

  getComments(query?: MentorCommentQuery): Promise<MentorComment[]>

  createComment(request: CreateMentorCommentRequest): Promise<MentorComment>

  updateComment(id: string, request: UpdateMentorCommentRequest): Promise<MentorComment>

  deleteComment(id: string): Promise<void>

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
