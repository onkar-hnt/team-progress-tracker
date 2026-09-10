import { z } from 'zod'

import { PROGRESS_MAX, PROGRESS_MIN } from '@constants/task.constants'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'

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

export const developerSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  role: nonEmptyStringSchema.optional(),
  location: nonEmptyStringSchema.optional(),
  active: z.boolean(),
})

export const projectSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  client: nonEmptyStringSchema.optional(),
  active: z.boolean(),
})

export const dailyWorkEntrySchema = z
  .object({
    id: nonEmptyStringSchema,
    date: isoDateSchema,
    developerId: nonEmptyStringSchema,
    projectId: nonEmptyStringSchema,
    taskTitle: nonEmptyStringSchema,
    description: nonEmptyStringSchema.optional(),
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
