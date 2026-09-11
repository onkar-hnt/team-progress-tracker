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
import type { AppSupabaseClient } from '@services/supabase/index'

import type { DataProvider, DataProviderCapabilities } from '../data-provider.interface'
import {
  deleteDailyUpdateRow,
  insertDailyUpdate,
  selectDailyUpdateById,
  selectDailyUpdates,
  updateDailyUpdateRow,
} from './daily-updates.repository'
import {
  deleteDeveloperRow,
  insertDeveloper,
  selectDevelopers,
  updateDeveloperRow,
} from './developers.repository'
import {
  deleteCommentRow,
  insertComment,
  selectComments,
  updateCommentRow,
} from './feedback.repository'
import {
  replaceMentorAssignments,
  selectMentorAssignments,
} from './mentor-assignments.repository'
import {
  deleteMentorRow,
  insertMentor,
  selectMentors,
  updateMentorRow,
} from './mentors.repository'
import {
  deleteProjectRow,
  insertProject,
  selectProjects,
  updateProjectRow,
} from './projects.repository'
import {
  deleteTaskRow,
  insertTask,
  selectTaskById,
  selectTasks,
  updateTaskRow,
} from './tasks.repository'

export interface SupabaseDataProviderOptions {
  client: AppSupabaseClient
}

/**
 * Supabase as the application's storage.
 *
 * Implements the same `DataProvider` interface as the Excel and mock
 * providers, and that is the entire point of the migration being tractable:
 * `WorkTrackerService`, the query hooks, the pages and the styles are all
 * unchanged, because none of them can tell which implementation they are
 * talking to.
 *
 * The migration is complete. Every entity is served from a repository here,
 * and the fixture delegate that stood in for the tables still being moved is
 * gone along with the last of them.
 *
 * Two responsibilities the Excel provider carried are deliberately absent
 * here, because the database has taken them over:
 *
 * - **Identifiers.** `id` and the `MEN001`-style codes come from column
 *   defaults. Nothing in the browser counts rows to guess the next one.
 * - **Referential integrity.** Foreign keys refuse the write; this provider
 *   translates the refusal instead of pre-emptively counting dependants.
 *
 * Access control stays where it was — out of this layer entirely — with one
 * addition worth being explicit about: row-level security now filters reads
 * server-side as well. A read here returns what the caller is permitted to
 * see, and `WorkTrackerService` narrows it further for display. Neither
 * relies on the other.
 */
export class SupabaseDataProvider implements DataProvider {
  private readonly client: AppSupabaseClient

  constructor(options: SupabaseDataProviderOptions) {
    this.client = options.client
  }

  readonly name = 'Supabase'

  /**
   * Always writable.
   *
   * Whether a *particular* write is allowed is decided per row by RLS, which
   * this flag cannot express — it exists so the UI can disable actions
   * against a read-only workbook, not to predict authorization.
   */
  get capabilities(): DataProviderCapabilities {
    return { canWrite: true }
  }

  // ---------------------------------------------------------------------------
  // Employees — served by Supabase
  // ---------------------------------------------------------------------------

  getDevelopers(): Promise<Developer[]> {
    return selectDevelopers(this.client)
  }

  createDeveloper(request: CreateDeveloperRequest): Promise<Developer> {
    return insertDeveloper(this.client, request)
  }

  updateDeveloper(id: string, request: UpdateDeveloperRequest): Promise<Developer> {
    return updateDeveloperRow(this.client, id, request)
  }

  deleteDeveloper(id: string): Promise<void> {
    return deleteDeveloperRow(this.client, id)
  }

  // ---------------------------------------------------------------------------
  // Mentors — served by Supabase
  // ---------------------------------------------------------------------------

  getMentors(): Promise<Mentor[]> {
    return selectMentors(this.client)
  }

  createMentor(request: CreateMentorRequest): Promise<Mentor> {
    return insertMentor(this.client, request)
  }

  /**
   * Also how a mentor is activated and deactivated.
   *
   * There is no separate operation for it: `active` is an ordinary field on
   * the record, the admin form edits it as a checkbox, and treating it as its
   * own endpoint would add a second path to the same column.
   */
  updateMentor(id: string, request: UpdateMentorRequest): Promise<Mentor> {
    return updateMentorRow(this.client, id, request)
  }

  deleteMentor(id: string): Promise<void> {
    return deleteMentorRow(this.client, id)
  }

  getMentorAssignments(): Promise<MentorAssignment[]> {
    return selectMentorAssignments(this.client)
  }

  setMentorAssignments(
    mentorId: string,
    developerIds: readonly string[],
  ): Promise<MentorAssignment[]> {
    return replaceMentorAssignments(this.client, mentorId, developerIds)
  }

  // ---------------------------------------------------------------------------
  // Projects — served by Supabase
  // ---------------------------------------------------------------------------
  // The team list travels with the project rather than through methods of its
  // own, because that is how `Project` models it and how the admin form edits
  // it. `projects.repository` writes both tables.

  getProjects(): Promise<Project[]> {
    return selectProjects(this.client)
  }

  createProject(request: CreateProjectRequest): Promise<Project> {
    return insertProject(this.client, request)
  }

  updateProject(id: string, request: UpdateProjectRequest): Promise<Project> {
    return updateProjectRow(this.client, id, request)
  }

  deleteProject(id: string): Promise<void> {
    return deleteProjectRow(this.client, id)
  }

  // ---------------------------------------------------------------------------
  // Tasks — served by Supabase
  // ---------------------------------------------------------------------------
  // The only slice that filters at source. The query maps onto SQL, and the
  // schema carries indexes built for these predicates.

  getTasks(query?: AssignedTaskQuery): Promise<AssignedTask[]> {
    return selectTasks(this.client, query)
  }

  getTaskById(id: string): Promise<AssignedTask | null> {
    return selectTaskById(this.client, id)
  }

  createTask(request: CreateAssignedTaskRequest): Promise<AssignedTask> {
    return insertTask(this.client, request)
  }

  updateTask(id: string, request: UpdateAssignedTaskRequest): Promise<AssignedTask> {
    return updateTaskRow(this.client, id, request)
  }

  deleteTask(id: string): Promise<void> {
    return deleteTaskRow(this.client, id)
  }

  // ---------------------------------------------------------------------------
  // Daily updates — served by Supabase
  // ---------------------------------------------------------------------------
  // Also filtered at source. The busiest reads in the application are here:
  // every dashboard panel asks this table for a day or a week.

  getDailyWorkEntries(query?: DailyWorkQuery): Promise<DailyWorkEntry[]> {
    return selectDailyUpdates(this.client, query)
  }

  getDailyWorkEntryById(id: string): Promise<DailyWorkEntry | null> {
    return selectDailyUpdateById(this.client, id)
  }

  createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry> {
    return insertDailyUpdate(this.client, request)
  }

  updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry> {
    return updateDailyUpdateRow(this.client, id, request)
  }

  deleteDailyWorkEntry(id: string): Promise<void> {
    return deleteDailyUpdateRow(this.client, id)
  }

  // ---------------------------------------------------------------------------
  // Feedback — served by Supabase
  // ---------------------------------------------------------------------------
  // Each comment names the task it is about. The task must belong to the same
  // developer, which `feedback_guard_task` enforces in the database because it
  // compares two columns of the row and no pre-flight check can see that.

  getComments(query?: MentorCommentQuery): Promise<MentorComment[]> {
    return selectComments(this.client, query)
  }

  createComment(request: CreateMentorCommentRequest): Promise<MentorComment> {
    return insertComment(this.client, request)
  }

  updateComment(id: string, request: UpdateMentorCommentRequest): Promise<MentorComment> {
    return updateCommentRow(this.client, id, request)
  }

  deleteComment(id: string): Promise<void> {
    return deleteCommentRow(this.client, id)
  }
}
