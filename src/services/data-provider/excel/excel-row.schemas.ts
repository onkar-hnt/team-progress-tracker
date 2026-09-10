import { z } from 'zod'

import { PROGRESS_MAX, PROGRESS_MIN } from '@constants/task.constants'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import { PROJECT_STATUSES } from '@models/project.model'
import { USER_ROLES } from '@models/user.model'

import { isIsoDateString } from './excel-value.utils'

/**
 * Schemas for the domain models produced by the Excel mappers.
 *
 * Cell-level coercion happens first, in `excel-value.utils`. These schemas are
 * the final gate: they assert that a mapped record satisfies the business
 * rules before it reaches the application, and they are reused to validate
 * records on the way back out to any backend.
 */

const isoDateSchema = z
  .string()
  .refine(isIsoDateString, { message: 'must be a valid calendar date (yyyy-MM-dd)' })

const isoTimestampSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'must be a valid timestamp' })

const nonEmptyStringSchema = z.string().trim().min(1)

/**
 * Lower-cased on the way in so that address comparisons during sign-in are
 * case-insensitive without every caller having to remember.
 */
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
    message: 'must be an email address',
  })

export const developerSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  employeeId: nonEmptyStringSchema.optional(),
  role: nonEmptyStringSchema.optional(),
  location: nonEmptyStringSchema.optional(),
  active: z.boolean(),
  email: emailSchema.optional(),
  accessRole: z.enum(USER_ROLES).optional(),
  primaryProjectId: nonEmptyStringSchema.optional(),
  createdDate: isoDateSchema.optional(),
})

export const mentorSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  email: emailSchema,
  active: z.boolean(),
  createdDate: isoDateSchema.optional(),
})

export const mentorAssignmentSchema = z.object({
  mentorId: nonEmptyStringSchema,
  developerId: nonEmptyStringSchema,
  id: nonEmptyStringSchema.optional(),
  assignedDate: isoDateSchema.optional(),
  active: z.boolean().optional(),
})

export const projectSchema = z
  .object({
    id: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    client: nonEmptyStringSchema.optional(),
    active: z.boolean(),
    description: nonEmptyStringSchema.optional(),
    status: z.enum(PROJECT_STATUSES),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    mentorId: nonEmptyStringSchema.optional(),
    assignedDeveloperIds: z.array(nonEmptyStringSchema),
  })
  .refine(
    (project) =>
      project.startDate === undefined ||
      project.endDate === undefined ||
      project.startDate <= project.endDate,
    { message: 'EndDate cannot be before StartDate', path: ['endDate'] },
  )

export const assignedTaskSchema = z
  .object({
    id: nonEmptyStringSchema,
    name: nonEmptyStringSchema,
    description: nonEmptyStringSchema.optional(),
    projectId: nonEmptyStringSchema,
    developerId: nonEmptyStringSchema,
    mentorId: nonEmptyStringSchema.optional(),
    priority: z.enum(TASK_PRIORITIES),
    status: z.enum(TASK_STATUSES),
    createdDate: isoDateSchema,
    dueDate: isoDateSchema.optional(),
    updatedAt: isoTimestampSchema,
  })
  .refine(
    (task) => task.dueDate === undefined || task.createdDate <= task.dueDate,
    { message: 'DueDate cannot be before CreatedDate', path: ['dueDate'] },
  )

export const mentorCommentSchema = z.object({
  id: nonEmptyStringSchema,
  developerId: nonEmptyStringSchema,
  mentorId: nonEmptyStringSchema,
  projectId: nonEmptyStringSchema.optional(),
  date: isoDateSchema,
  comment: nonEmptyStringSchema,
  progressUpdate: nonEmptyStringSchema.optional(),
  blockers: nonEmptyStringSchema.optional(),
  recommendations: nonEmptyStringSchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
})

export const dailyWorkEntrySchema = z
  .object({
    id: nonEmptyStringSchema,
    date: isoDateSchema,
    developerId: nonEmptyStringSchema,
    projectId: nonEmptyStringSchema,
    taskTitle: nonEmptyStringSchema,
    description: nonEmptyStringSchema.optional(),
    workDone: nonEmptyStringSchema.optional(),
    plannedWork: nonEmptyStringSchema.optional(),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    progress: z
      .number()
      .min(PROGRESS_MIN, { message: `must be at least ${PROGRESS_MIN}` })
      .max(PROGRESS_MAX, { message: `must be at most ${PROGRESS_MAX}` }),
    hoursSpent: z.number().min(0, { message: 'cannot be negative' }).optional(),
    isBlocked: z.boolean(),
    blockerDescription: nonEmptyStringSchema.optional(),
    remarks: nonEmptyStringSchema.optional(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .refine((entry) => !entry.isBlocked || entry.blockerDescription !== undefined, {
    message: 'BlockerDescription is required when IsBlocked is Yes',
    path: ['blockerDescription'],
  })

/** Flattens Zod issues into messages prefixed with the offending field. */
export function describeZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map((segment) => String(segment)).join('.')
    return path === '' ? issue.message : `${path}: ${issue.message}`
  })
}
