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
  deleteDeveloperRow,
  insertDeveloper,
  selectDevelopers,
  updateDeveloperRow,
} from './developers.repository'
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

export interface SupabaseDataProviderOptions {
  client: AppSupabaseClient

  /**
   * Serves the tables that have not moved to Supabase yet.
   *
   * The alternative was to throw from every unmigrated method, which would
   * make the application unusable for the length of the migration and leave
   * nothing to compare the migrated behaviour against. Delegating instead
   * keeps every screen working while they are moved across one at a time.
   *
   * Typed as `DataProvider` rather than as the Excel provider, because this
   * class has no business knowing what is behind it.
   */
  unmigrated: DataProvider
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
 * MIGRATION IN PROGRESS. Employees, mentors, mentor assignments and projects
 * are served from Supabase; tasks, daily updates and feedback are delegated.
 * Each phase moves one entity from the delegated block at the bottom of this
 * file up into a repository call, and the delegate disappears when the last
 * one lands.
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
  private readonly unmigrated: DataProvider

  constructor(options: SupabaseDataProviderOptions) {
    this.client = options.client
    this.unmigrated = options.unmigrated
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
  // Not yet migrated
  // ---------------------------------------------------------------------------
  // Delegated verbatim. Each of these becomes a repository call in a later
  // phase; until then they behave exactly as they did before Supabase was
  // introduced, which is what makes a phase's effect on the app easy to see.

  getTasks(query?: AssignedTaskQuery): Promise<AssignedTask[]> {
    return this.unmigrated.getTasks(query)
  }

  getTaskById(id: string): Promise<AssignedTask | null> {
    return this.unmigrated.getTaskById(id)
  }

  createTask(request: CreateAssignedTaskRequest): Promise<AssignedTask> {
    return this.unmigrated.createTask(request)
  }

  updateTask(id: string, request: UpdateAssignedTaskRequest): Promise<AssignedTask> {
    return this.unmigrated.updateTask(id, request)
  }

  deleteTask(id: string): Promise<void> {
    return this.unmigrated.deleteTask(id)
  }

  getComments(query?: MentorCommentQuery): Promise<MentorComment[]> {
    return this.unmigrated.getComments(query)
  }

  createComment(request: CreateMentorCommentRequest): Promise<MentorComment> {
    return this.unmigrated.createComment(request)
  }

  updateComment(id: string, request: UpdateMentorCommentRequest): Promise<MentorComment> {
    return this.unmigrated.updateComment(id, request)
  }

  deleteComment(id: string): Promise<void> {
    return this.unmigrated.deleteComment(id)
  }

  getDailyWorkEntries(query?: DailyWorkQuery): Promise<DailyWorkEntry[]> {
    return this.unmigrated.getDailyWorkEntries(query)
  }

  getDailyWorkEntryById(id: string): Promise<DailyWorkEntry | null> {
    return this.unmigrated.getDailyWorkEntryById(id)
  }

  createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry> {
    return this.unmigrated.createDailyWorkEntry(request)
  }

  updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry> {
    return this.unmigrated.updateDailyWorkEntry(id, request)
  }

  deleteDailyWorkEntry(id: string): Promise<void> {
    return this.unmigrated.deleteDailyWorkEntry(id)
  }
}
