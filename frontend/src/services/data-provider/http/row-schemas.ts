import { z } from 'zod'

import type {
  AssignedTask,
  DailyWorkEntry,
  Developer,
  Mentor,
  MentorAssignment,
  MentorComment,
  Project,
} from '@models/index'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import { PROJECT_STATUSES } from '@models/project.model'
import { USER_ROLES } from '@models/user.model'
import { isIsoDateString } from '@utils/date.utils'

import { optionalField } from './parse-rows'

const nullableString = z.string().nullable()
const optionalNullableString = nullableString.optional()

export const developerRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: optionalNullableString,
  employeeId: optionalNullableString,
  role: optionalNullableString,
  location: optionalNullableString,
  active: z.boolean(),
  email: optionalNullableString,
  accessRole: z.enum(USER_ROLES).nullable().optional(),
  profileId: optionalNullableString,
  primaryProjectId: optionalNullableString,
  createdDate: optionalNullableString,
  deletedAt: optionalNullableString,
})

export type DeveloperRow = z.infer<typeof developerRowSchema>

export function toDeveloper(row: DeveloperRow): Developer {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    ...optionalField('code', row.code),
    ...optionalField('employeeId', row.employeeId),
    ...optionalField('role', row.role),
    ...optionalField('location', row.location),
    ...optionalField('email', row.email),
    ...optionalField('accessRole', row.accessRole),
    ...optionalField('profileId', row.profileId),
    ...optionalField('primaryProjectId', row.primaryProjectId),
    ...optionalField('createdDate', row.createdDate),
    ...optionalField('deletedAt', row.deletedAt),
  }
}

export const mentorRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
  active: z.boolean(),
  code: optionalNullableString,
  createdDate: optionalNullableString,
  profileId: optionalNullableString,
  deletedAt: optionalNullableString,
})

export type MentorRow = z.infer<typeof mentorRowSchema>

export function toMentor(row: MentorRow): Mentor {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    active: row.active,
    ...optionalField('code', row.code),
    ...optionalField('createdDate', row.createdDate),
    ...optionalField('profileId', row.profileId),
    ...optionalField('deletedAt', row.deletedAt),
  }
}

export const mentorAssignmentRowSchema = z.object({
  mentorId: z.string().min(1),
  developerId: z.string().min(1),
  id: optionalNullableString,
  assignedDate: optionalNullableString,
  active: z.boolean().nullable().optional(),
})

export type MentorAssignmentRow = z.infer<typeof mentorAssignmentRowSchema>

export function toMentorAssignment(row: MentorAssignmentRow): MentorAssignment {
  return {
    mentorId: row.mentorId,
    developerId: row.developerId,
    ...optionalField('id', row.id),
    ...optionalField('assignedDate', row.assignedDate),
    ...optionalField('active', row.active),
  }
}

export function mentorAssignmentRecordId(record: MentorAssignment): string {
  return record.id ?? `${record.mentorId}:${record.developerId}`
}

export const projectRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: optionalNullableString,
  client: optionalNullableString,
  description: optionalNullableString,
  status: z.enum(PROJECT_STATUSES),
  active: z.boolean(),
  startDate: optionalNullableString,
  endDate: optionalNullableString,
  mentorId: optionalNullableString,
  assignedDeveloperIds: z.array(z.string()).default([]),
  deletedAt: optionalNullableString,
})

export type ProjectRow = z.infer<typeof projectRowSchema>

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    status: row.status,
    assignedDeveloperIds: [...row.assignedDeveloperIds].sort((left, right) =>
      left.localeCompare(right),
    ),
    ...optionalField('code', row.code),
    ...optionalField('client', row.client),
    ...optionalField('description', row.description),
    ...optionalField('startDate', row.startDate),
    ...optionalField('endDate', row.endDate),
    ...optionalField('mentorId', row.mentorId),
    ...optionalField('deletedAt', row.deletedAt),
  }
}

export const taskRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: optionalNullableString,
  description: optionalNullableString,
  projectId: z.string().min(1),
  developerId: z.string().min(1),
  mentorId: optionalNullableString,
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  createdDate: z.string().min(1),
  dueDate: optionalNullableString,
  estimatedHours: z.number().nullable().optional(),
  workedDays: z.number(),
  actualHours: z.number(),
  updatedAt: z.string().min(1),
})

export type TaskRow = z.infer<typeof taskRowSchema>

export function toAssignedTask(row: TaskRow): AssignedTask {
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    developerId: row.developerId,
    priority: row.priority,
    status: row.status,
    createdDate: row.createdDate,
    workedDays: row.workedDays,
    actualHours: row.actualHours,
    updatedAt: row.updatedAt,
    ...optionalField('code', row.code),
    ...optionalField('description', row.description),
    ...optionalField('mentorId', row.mentorId),
    ...optionalField('dueDate', row.dueDate),
    ...optionalField('estimatedHours', row.estimatedHours),
  }
}

export const dailyWorkRowSchema = z.object({
  id: z.string().min(1),
  date: z.string().refine(isIsoDateString, { message: 'expected a yyyy-MM-dd date' }),
  developerId: z.string().min(1),
  projectId: z.string().min(1),
  taskId: optionalNullableString,
  taskTitle: z.string().min(1),
  description: optionalNullableString,
  workDone: optionalNullableString,
  plannedWork: optionalNullableString,
  status: z.enum(TASK_STATUSES),
  priority: z.enum(TASK_PRIORITIES),
  progress: z.number(),
  hoursSpent: z.number().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  isBlocked: z.boolean(),
  blockerDescription: optionalNullableString,
  remarks: optionalNullableString,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export type DailyWorkRow = z.infer<typeof dailyWorkRowSchema>

function toIsoTimestamp(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

export function toDailyWorkEntry(row: DailyWorkRow): DailyWorkEntry {
  return {
    id: row.id,
    date: row.date,
    developerId: row.developerId,
    projectId: row.projectId,
    taskTitle: row.taskTitle,
    status: row.status,
    priority: row.priority,
    progress: row.progress,
    isBlocked: row.isBlocked,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
    ...optionalField('taskId', row.taskId),
    ...optionalField('description', row.description),
    ...optionalField('workDone', row.workDone),
    ...optionalField('plannedWork', row.plannedWork),
    ...optionalField('hoursSpent', row.hoursSpent),
    ...optionalField('estimatedHours', row.estimatedHours),
    ...optionalField('blockerDescription', row.blockerDescription),
    ...optionalField('remarks', row.remarks),
  }
}

const commentAuthorRoles = ['admin', 'developer', 'mentor'] as const

export const commentRowSchema = z.object({
  id: z.string().min(1),
  developerId: z.string().min(1),
  mentorId: optionalNullableString,
  authorProfileId: optionalNullableString,
  authorRole: z.enum(commentAuthorRoles).nullable().optional(),
  taskId: optionalNullableString,
  projectId: optionalNullableString,
  date: z.string().min(1),
  comment: z.string().min(1),
  progressUpdate: optionalNullableString,
  blockers: optionalNullableString,
  recommendations: optionalNullableString,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export type CommentRow = z.infer<typeof commentRowSchema>

export function toMentorComment(row: CommentRow): MentorComment {
  return {
    id: row.id,
    developerId: row.developerId,
    date: row.date,
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...optionalField('mentorId', row.mentorId),
    ...optionalField('authorProfileId', row.authorProfileId),
    ...optionalField('authorRole', row.authorRole),
    ...optionalField('taskId', row.taskId),
    ...optionalField('projectId', row.projectId),
    ...optionalField('progressUpdate', row.progressUpdate),
    ...optionalField('blockers', row.blockers),
    ...optionalField('recommendations', row.recommendations),
  }
}
