import { z } from 'zod'

import { PROGRESS_MAX, PROGRESS_MIN } from '@constants/task.constants'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import type { CreateDailyWorkEntryRequest, DailyWorkEntry } from '@models/index'
import { isIsoDateString, todayIsoDate } from '@utils/date.utils'
import { richTextSchema } from '@utils/rich-text.schema'
import { isRichTextEmpty, normaliseRichText } from '@utils/rich-text.utils'

const TASK_TITLE_MAX = 160
const WORK_DONE_MAX = 2000

const baseSchema = z
  .object({
    date: z
      .string()
      .refine(isIsoDateString, { message: 'Select a valid date' })
      .refine((value) => value <= todayIsoDate(), {
        message: 'The date cannot be in the future',
      }),

    developerId: z.string().min(1, { message: 'Select a developer' }),

    projectId: z.string().min(1, { message: 'Select a project' }),

    taskId: z.string(),

    taskTitle: z
      .string()
      .trim()
      .min(1, { message: 'Enter what you worked on' })
      .max(TASK_TITLE_MAX, { message: `Keep the title under ${TASK_TITLE_MAX} characters` }),

    /**
     * What moved today, as formatting markup. The title names the task and
     * stays the same across the days it takes, so without this the whole day
     * ends up in the title and the task is named after one afternoon of it.
     */
    workDone: richTextSchema({ max: WORK_DONE_MAX }),

    status: z.enum(TASK_STATUSES),

    progress: z.string().refine(
      (value) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) && parsed >= PROGRESS_MIN && parsed <= PROGRESS_MAX
      },
      { message: 'Select a progress value' },
    ),

    /** Hours the whole task is expected to take; blank keeps the current figure. */
    estimatedHours: z.string(),

    /** Hours this day cost, which is what makes the total exact rather than assumed. */
    hoursSpent: z.string(),

    // Not shown in the form but required when editing an existing entry.
    priority: z.enum(TASK_PRIORITIES),
  })

const HOURS_MAX = 999.99

/**
 * The hours and the day's work are required on a new entry and optional when
 * correcting an old one: the person editing may have no idea what the day cost
 * or what was expected at the time, and every entry logged before there was a
 * field for it has nothing to say there.
 */
export function dailyUpdateFormSchema(options: { isNewEntry: boolean }) {
  return baseSchema.superRefine((values, ctx) => {
    checkProgress(values, ctx)

    if (options.isNewEntry && isRichTextEmpty(values.workDone)) {
      ctx.addIssue({
        code: 'custom',
        path: ['workDone'],
        message: 'Say what you got done today',
      })
    }

    checkHours(ctx, {
      value: values.estimatedHours,
      field: 'estimatedHours',
      isRequired: options.isNewEntry,
      missingMessage: 'Enter the hours you expect this task to take',
    })

    checkHours(ctx, {
      value: values.hoursSpent,
      field: 'hoursSpent',
      isRequired: options.isNewEntry,
      missingMessage: 'Enter the hours you spent on this today',
    })
  })
}

function checkHours(
  ctx: z.RefinementCtx<z.infer<typeof baseSchema>>,
  options: {
    value: string
    field: 'estimatedHours' | 'hoursSpent'
    isRequired: boolean
    missingMessage: string
  },
) {
  const trimmed = options.value.trim()

  if (trimmed === '') {
    if (options.isRequired) {
      ctx.addIssue({ code: 'custom', path: [options.field], message: options.missingMessage })
    }

    return
  }

  const hours = Number(trimmed)

  if (!Number.isFinite(hours) || hours <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: [options.field],
      message: 'Enter a number of hours above zero',
    })

    return
  }

  if (hours > HOURS_MAX) {
    ctx.addIssue({
      code: 'custom',
      path: [options.field],
      message: `Keep this under ${String(HOURS_MAX)} hours`,
    })
  }
}

function checkProgress(
  values: z.infer<typeof baseSchema>,
  ctx: z.RefinementCtx<z.infer<typeof baseSchema>>,
) {
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
}

export type DailyUpdateFormValues = z.infer<typeof baseSchema>

export function toFormValues(entry: DailyWorkEntry): DailyUpdateFormValues {
  return {
    date: entry.date,
    developerId: entry.developerId,
    projectId: entry.projectId,
    taskId: entry.taskId ?? '',
    taskTitle: entry.taskTitle,
    workDone: entry.workDone ?? '',
    status: entry.status,
    progress: String(entry.progress),
    estimatedHours: entry.estimatedHours === undefined ? '' : String(entry.estimatedHours),
    hoursSpent: entry.hoursSpent === undefined ? '' : String(entry.hoursSpent),
    priority: entry.priority,
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
    taskId: '',
    taskTitle: '',
    workDone: '',
    status: 'in-progress',
    progress: '0',
    estimatedHours: '',
    hoursSpent: '',
    priority: 'medium',
  }
}

export function toCreateDailyWorkEntryRequest(
  values: DailyUpdateFormValues,
): CreateDailyWorkEntryRequest {
  const isBlocked = values.status === 'blocked'
  const estimate = values.estimatedHours.trim()
  const spent = values.hoursSpent.trim()

  return {
    date: values.date,
    developerId: values.developerId,
    projectId: values.projectId,
    taskId: values.taskId === '' ? undefined : values.taskId,
    taskTitle: values.taskTitle.trim(),
    // Sent even when empty, so clearing it clears the stored value rather than
    // leaving the previous day's.
    workDone: normaliseRichText(values.workDone),
    status: values.status,
    priority: values.priority,
    progress: Number(values.progress),
    isBlocked,
    ...(estimate === '' ? {} : { estimatedHours: Number(estimate) }),
    ...(spent === '' ? {} : { hoursSpent: Number(spent) }),
    ...(isBlocked ? {} : { blockerDescription: undefined }),
  }
}
