import { z } from 'zod'

import { PROGRESS_MAX, PROGRESS_MIN } from '@constants/task.constants'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import type { CreateDailyWorkEntryRequest, DailyWorkEntry } from '@models/index'
import { isIsoDateString } from '@services/data-provider/excel/excel-value.utils'
import { todayIsoDate } from '@utils/date.utils'

/**
 * Validation for the daily update form.
 *
 * Every field is a string because that is what inputs and `<select>` elements
 * produce. Validation happens on those raw strings and conversion to the
 * domain request is a separate, explicit step, which keeps the form free of
 * hidden coercion and makes both halves testable on their own.
 */

const TASK_TITLE_MAX = 160
const DESCRIPTION_MAX = 1000
const BLOCKER_MAX = 500
const REMARKS_MAX = 500

export const BLOCKED_CHOICES = ['no', 'yes'] as const

export type BlockedChoice = (typeof BLOCKED_CHOICES)[number]

export const dailyUpdateFormSchema = z
  .object({
    date: z
      .string()
      .refine(isIsoDateString, { message: 'Select a valid date' })
      // Work cannot be reported before it happens, and a mistyped future date
      // would silently distort every trend it lands in.
      .refine((value) => value <= todayIsoDate(), {
        message: 'The date cannot be in the future',
      }),

    developerId: z.string().min(1, { message: 'Select a developer' }),

    projectId: z.string().min(1, { message: 'Select a project' }),

    taskTitle: z
      .string()
      .trim()
      .min(1, { message: 'Enter what you worked on' })
      .max(TASK_TITLE_MAX, { message: `Keep the title under ${TASK_TITLE_MAX} characters` }),

    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, { message: `Keep the description under ${DESCRIPTION_MAX} characters` }),

    workDone: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, { message: `Keep this under ${DESCRIPTION_MAX} characters` }),

    plannedWork: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, { message: `Keep this under ${DESCRIPTION_MAX} characters` }),

    status: z.enum(TASK_STATUSES),

    priority: z.enum(TASK_PRIORITIES),

    progress: z.string().refine(
      (value) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) && parsed >= PROGRESS_MIN && parsed <= PROGRESS_MAX
      },
      { message: 'Select a progress value' },
    ),

    /** Empty means "not recorded", which is allowed. */
    hoursSpent: z.string().refine(
      (value) => {
        if (value === '') return true
        const parsed = Number(value)
        return Number.isFinite(parsed) && parsed >= 0
      },
      { message: 'Select the hours spent' },
    ),

    isBlocked: z.enum(BLOCKED_CHOICES),

    blockerDescription: z
      .string()
      .trim()
      .max(BLOCKER_MAX, { message: `Keep the blocker under ${BLOCKER_MAX} characters` }),

    remarks: z
      .string()
      .trim()
      .max(REMARKS_MAX, { message: `Keep remarks under ${REMARKS_MAX} characters` }),
  })
  .superRefine((values, ctx) => {
    // A blocker with no explanation gives the mentor nothing to act on.
    if (values.isBlocked === 'yes' && values.blockerDescription === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['blockerDescription'],
        message: 'Describe the blocker so it can be followed up',
      })
    }

    // Completed work at partial progress would make completion rates
    // meaningless, so the two fields are kept consistent.
    if (values.status === 'completed' && Number(values.progress) !== PROGRESS_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['progress'],
        message: 'Completed work should be at 100%',
      })
    }

    if (values.status === 'not-started' && Number(values.progress) !== PROGRESS_MIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['progress'],
        message: 'Work that has not started should be at 0%',
      })
    }
  })

export type DailyUpdateFormValues = z.infer<typeof dailyUpdateFormSchema>

/** Fills the form from an existing entry, for editing. */
export function toFormValues(entry: DailyWorkEntry): DailyUpdateFormValues {
  return {
    date: entry.date,
    developerId: entry.developerId,
    projectId: entry.projectId,
    taskTitle: entry.taskTitle,
    description: entry.description ?? '',
    workDone: entry.workDone ?? '',
    plannedWork: entry.plannedWork ?? '',
    status: entry.status,
    priority: entry.priority,
    progress: String(entry.progress),
    hoursSpent: entry.hoursSpent === undefined ? '' : String(entry.hoursSpent),
    isBlocked: entry.isBlocked ? 'yes' : 'no',
    blockerDescription: entry.blockerDescription ?? '',
    remarks: entry.remarks ?? '',
  }
}

export function createEmptyFormValues(options: {
  date: string
  developerId: string
}): DailyUpdateFormValues {
  return {
    date: options.date,
    developerId: options.developerId,
    projectId: '',
    taskTitle: '',
    description: '',
    workDone: '',
    plannedWork: '',
    status: 'in-progress',
    priority: 'medium',
    progress: '0',
    hoursSpent: '',
    isBlocked: 'no',
    blockerDescription: '',
    remarks: '',
  }
}

/**
 * Converts validated form values into a provider request.
 *
 * Blank optional text becomes an absent field rather than an empty string, so
 * the workbook never stores `""` where "nothing was entered" is meant. The
 * blocker note is dropped when the entry is not blocked, which stops a stale
 * explanation lingering after someone flips the answer back to No.
 */
export function toCreateDailyWorkEntryRequest(
  values: DailyUpdateFormValues,
): CreateDailyWorkEntryRequest {
  const isBlocked = values.isBlocked === 'yes'

  return {
    date: values.date,
    developerId: values.developerId,
    projectId: values.projectId,
    taskTitle: values.taskTitle.trim(),
    status: values.status,
    priority: values.priority,
    progress: Number(values.progress),
    isBlocked,
    ...(values.description === '' ? {} : { description: values.description.trim() }),
    ...(values.workDone === '' ? {} : { workDone: values.workDone.trim() }),
    ...(values.plannedWork === '' ? {} : { plannedWork: values.plannedWork.trim() }),
    ...(values.hoursSpent === '' ? {} : { hoursSpent: Number(values.hoursSpent) }),
    ...(isBlocked && values.blockerDescription !== ''
      ? { blockerDescription: values.blockerDescription.trim() }
      : {}),
    ...(values.remarks === '' ? {} : { remarks: values.remarks.trim() }),
  }
}
