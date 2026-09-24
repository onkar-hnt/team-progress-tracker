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
  selectResponsibleProjectIds,
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

export class SupabaseDataProvider implements DataProvider {
  private readonly client: AppSupabaseClient

  constructor(options: SupabaseDataProviderOptions) {
    this.client = options.client
  }

  readonly name = 'Supabase'

  get capabilities(): DataProviderCapabilities {
    return { canWrite: true }
  }

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

  getMentors(): Promise<Mentor[]> {
    return selectMentors(this.client)
  }

  createMentor(request: CreateMentorRequest): Promise<Mentor> {
    return insertMentor(this.client, request)
  }

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

  getProjects(): Promise<Project[]> {
    return selectProjects(this.client)
  }

  getResponsibleProjectIds(mentorId: string): Promise<string[]> {
    return selectResponsibleProjectIds(this.client, mentorId)
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
