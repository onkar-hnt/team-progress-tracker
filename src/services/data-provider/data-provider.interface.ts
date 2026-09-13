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

export interface DataProviderCapabilities {
  canWrite: boolean
}

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

  setMentorAssignments(mentorId: string, developerIds: readonly string[]): Promise<MentorAssignment[]>

  getProjects(): Promise<Project[]>

  createProject(request: CreateProjectRequest): Promise<Project>

  updateProject(id: string, request: UpdateProjectRequest): Promise<Project>

  deleteProject(id: string): Promise<void>

  getTasks(query?: AssignedTaskQuery): Promise<AssignedTask[]>

  getTaskById(id: string): Promise<AssignedTask | null>

  createTask(request: CreateAssignedTaskRequest): Promise<AssignedTask>

  updateTask(id: string, request: UpdateAssignedTaskRequest): Promise<AssignedTask>

  deleteTask(id: string): Promise<void>

  /** Newest first when `query.limit` is set; otherwise unordered. */
  getComments(query?: MentorCommentQuery): Promise<MentorComment[]>

  createComment(request: CreateMentorCommentRequest): Promise<MentorComment>

  updateComment(id: string, request: UpdateMentorCommentRequest): Promise<MentorComment>

  deleteComment(id: string): Promise<void>

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
