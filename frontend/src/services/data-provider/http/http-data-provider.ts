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
import { apiEndpoints } from '@config/api'
import { apiDelete, apiGet, apiPost, apiPut } from '@services/api/api-client'
import { ApiNotFoundError } from '@services/api/api.errors'
import { todayIsoDate } from '@utils/date.utils'

import type { DataProvider, DataProviderCapabilities } from '../data-provider.interface'
import { commentListQuery, dailyWorkListQuery, taskListQuery } from './query-params'
import { parseOne, parseRows } from './parse-rows'
import {
  commentCreateBody,
  commentUpdateBody,
  dailyWorkCreateBody,
  dailyWorkUpdateBody,
  developerCreateBody,
  developerUpdateBody,
  mentorCreateBody,
  mentorUpdateBody,
  projectCreateBody,
  projectUpdateBody,
  taskCreateBody,
  taskUpdateBody,
} from './request-bodies'
import {
  commentRowSchema,
  dailyWorkRowSchema,
  developerRowSchema,
  mentorAssignmentRecordId,
  mentorAssignmentRowSchema,
  mentorRowSchema,
  projectRowSchema,
  taskRowSchema,
  toAssignedTask,
  toDailyWorkEntry,
  toDeveloper,
  toMentor,
  toMentorAssignment,
  toMentorComment,
  toProject,
} from './row-schemas'

export class HttpDataProvider implements DataProvider {
  readonly name = 'API'

  get capabilities(): DataProviderCapabilities {
    return { canWrite: true }
  }

  async getDevelopers(): Promise<Developer[]> {
    const data = await apiGet<unknown[]>(apiEndpoints.developers.list)
    return parseRows('Developers', developerRowSchema, data, toDeveloper)
  }

  async createDeveloper(request: CreateDeveloperRequest): Promise<Developer> {
    const data = await apiPost<unknown>(apiEndpoints.developers.create, developerCreateBody({
      createdDate: todayIsoDate(),
      ...request,
    }))
    return parseOne('Developers', developerRowSchema, data, toDeveloper)
  }

  async updateDeveloper(id: string, request: UpdateDeveloperRequest): Promise<Developer> {
    const data = await apiPut<unknown>(apiEndpoints.developers.byId(id), developerUpdateBody(request))
    return parseOne('Developers', developerRowSchema, data, toDeveloper)
  }

  async deleteDeveloper(id: string): Promise<void> {
    await apiDelete(apiEndpoints.developers.byId(id))
  }

  async getMentors(): Promise<Mentor[]> {
    const data = await apiGet<unknown[]>(apiEndpoints.mentors.list)
    return parseRows('Mentors', mentorRowSchema, data, toMentor)
  }

  async createMentor(request: CreateMentorRequest): Promise<Mentor> {
    const data = await apiPost<unknown>(apiEndpoints.mentors.create, mentorCreateBody({
      createdDate: todayIsoDate(),
      ...request,
    }))
    return parseOne('Mentors', mentorRowSchema, data, toMentor)
  }

  async updateMentor(id: string, request: UpdateMentorRequest): Promise<Mentor> {
    const data = await apiPut<unknown>(apiEndpoints.mentors.byId(id), mentorUpdateBody(request))
    return parseOne('Mentors', mentorRowSchema, data, toMentor)
  }

  async deleteMentor(id: string): Promise<void> {
    await apiDelete(apiEndpoints.mentors.byId(id))
  }

  async getMentorAssignments(): Promise<MentorAssignment[]> {
    const data = await apiGet<unknown[]>(apiEndpoints.mentorAssignments.list)
    return parseRows(
      'MentorMapping',
      mentorAssignmentRowSchema,
      data,
      toMentorAssignment,
      mentorAssignmentRecordId,
    )
  }

  async setMentorAssignments(
    mentorId: string,
    developerIds: readonly string[],
  ): Promise<MentorAssignment[]> {
    const data = await apiPut<unknown[]>(apiEndpoints.mentors.assignments(mentorId), {
      developerIds: [...developerIds],
    })
    return parseRows(
      'MentorMapping',
      mentorAssignmentRowSchema,
      data,
      toMentorAssignment,
      mentorAssignmentRecordId,
    )
  }

  async getProjects(): Promise<Project[]> {
    const data = await apiGet<unknown[]>(apiEndpoints.projects.list)
    return parseRows('Projects', projectRowSchema, data, toProject)
  }

  async createProject(request: CreateProjectRequest): Promise<Project> {
    const data = await apiPost<unknown>(apiEndpoints.projects.create, projectCreateBody(request))
    return parseOne('Projects', projectRowSchema, data, toProject)
  }

  async updateProject(id: string, request: UpdateProjectRequest): Promise<Project> {
    const data = await apiPut<unknown>(apiEndpoints.projects.byId(id), projectUpdateBody(request))
    return parseOne('Projects', projectRowSchema, data, toProject)
  }

  async deleteProject(id: string): Promise<void> {
    await apiDelete(apiEndpoints.projects.byId(id))
  }

  async getTasks(query?: AssignedTaskQuery): Promise<AssignedTask[]> {
    const data = await apiGet<unknown[]>(apiEndpoints.tasks.list, { query: taskListQuery(query) })
    return parseRows('Tasks', taskRowSchema, data, toAssignedTask)
  }

  async getTaskById(id: string): Promise<AssignedTask | null> {
    try {
      const data = await apiGet<unknown>(apiEndpoints.tasks.byId(id))
      return parseOne('Tasks', taskRowSchema, data, toAssignedTask)
    } catch (error) {
      if (error instanceof ApiNotFoundError) return null
      throw error
    }
  }

  async createTask(request: CreateAssignedTaskRequest): Promise<AssignedTask> {
    const data = await apiPost<unknown>(apiEndpoints.tasks.create, taskCreateBody(request))
    return parseOne('Tasks', taskRowSchema, data, toAssignedTask)
  }

  async updateTask(id: string, request: UpdateAssignedTaskRequest): Promise<AssignedTask> {
    const data = await apiPut<unknown>(apiEndpoints.tasks.byId(id), taskUpdateBody(request))
    return parseOne('Tasks', taskRowSchema, data, toAssignedTask)
  }

  async deleteTask(id: string): Promise<void> {
    await apiDelete(apiEndpoints.tasks.byId(id))
  }

  async getComments(query?: MentorCommentQuery): Promise<MentorComment[]> {
    const data = await apiGet<unknown[]>(apiEndpoints.feedback.list, { query: commentListQuery(query) })
    return parseRows('Comments', commentRowSchema, data, toMentorComment)
  }

  async createComment(request: CreateMentorCommentRequest): Promise<MentorComment> {
    const data = await apiPost<unknown>(apiEndpoints.feedback.create, commentCreateBody(request))
    return parseOne('Comments', commentRowSchema, data, toMentorComment)
  }

  async updateComment(id: string, request: UpdateMentorCommentRequest): Promise<MentorComment> {
    const data = await apiPut<unknown>(apiEndpoints.feedback.byId(id), commentUpdateBody(request))
    return parseOne('Comments', commentRowSchema, data, toMentorComment)
  }

  async deleteComment(id: string): Promise<void> {
    await apiDelete(apiEndpoints.feedback.byId(id))
  }

  async getDailyWorkEntries(query?: DailyWorkQuery): Promise<DailyWorkEntry[]> {
    const data = await apiGet<unknown[]>(apiEndpoints.dailyUpdates.list, {
      query: dailyWorkListQuery(query),
    })
    return parseRows('DailyWork', dailyWorkRowSchema, data, toDailyWorkEntry)
  }

  async getDailyWorkEntryById(id: string): Promise<DailyWorkEntry | null> {
    try {
      const data = await apiGet<unknown>(apiEndpoints.dailyUpdates.byId(id))
      return parseOne('DailyWork', dailyWorkRowSchema, data, toDailyWorkEntry)
    } catch (error) {
      if (error instanceof ApiNotFoundError) return null
      throw error
    }
  }

  async createDailyWorkEntry(request: CreateDailyWorkEntryRequest): Promise<DailyWorkEntry> {
    const data = await apiPost<unknown>(apiEndpoints.dailyUpdates.create, dailyWorkCreateBody(request))
    return parseOne('DailyWork', dailyWorkRowSchema, data, toDailyWorkEntry)
  }

  async updateDailyWorkEntry(
    id: string,
    request: UpdateDailyWorkEntryRequest,
  ): Promise<DailyWorkEntry> {
    const data = await apiPut<unknown>(apiEndpoints.dailyUpdates.byId(id), dailyWorkUpdateBody(request))
    return parseOne('DailyWork', dailyWorkRowSchema, data, toDailyWorkEntry)
  }

  async deleteDailyWorkEntry(id: string): Promise<void> {
    await apiDelete(apiEndpoints.dailyUpdates.byId(id))
  }
}
