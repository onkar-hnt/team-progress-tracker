import { z } from 'zod'

import { PROGRESS_MAX, PROGRESS_MIN } from '@constants/task.constants'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import type { CreateDailyWorkEntryRequest, DailyWorkEntry } from '@models/index'
import { isIsoDateString, todayIsoDate } from '@utils/date.utils'

const TASK_TITLE_MAX = 160

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

    // Not shown in the form but required when editing an existing entry.
    priority: z.enum(TASK_PRIORITIES),
  })

const ESTIMATE_MAX = 999.99

/**
 * Required on a new entry, because that is the moment the figure is worth
 * asking for, and optional when correcting an old one, where the person
 * editing may have no idea what was expected at the time.
 */
export function dailyUpdateFormSchema(options: { requireEstimate: boolean }) {
  return baseSchema.superRefine((values, ctx) => {
    checkProgress(values, ctx)

    const estimate = values.estimatedHours.trim()

    if (estimate === '') {
      if (options.requireEstimate) {
        ctx.addIssue({
          code: 'custom',
          path: ['estimatedHours'],
          message: 'Enter the hours you expect this task to take',
        })
      }

      return
    }

    const parsed = Number(estimate)

    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['estimatedHours'],
        message: 'Enter a number of hours above zero',
      })

      return
    }

    if (parsed > ESTIMATE_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['estimatedHours'],
        message: `Keep the estimate under ${String(ESTIMATE_MAX)} hours`,
      })
    }
  })
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
    status: entry.status,
    progress: String(entry.progress),
    estimatedHours: entry.estimatedHours === undefined ? '' : String(entry.estimatedHours),
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
    status: 'in-progress',
    progress: '0',
    estimatedHours: '',
    priority: 'medium',
  }
}

export function toCreateDailyWorkEntryRequest(
  values: DailyUpdateFormValues,
): CreateDailyWorkEntryRequest {
  const isBlocked = values.status === 'blocked'
  const estimate = values.estimatedHours.trim()

  return {
    date: values.date,
    developerId: values.developerId,
    projectId: values.projectId,
    taskId: values.taskId === '' ? undefined : values.taskId,
    taskTitle: values.taskTitle.trim(),
    status: values.status,
    priority: values.priority,
    progress: Number(values.progress),
    isBlocked,
    ...(estimate === '' ? {} : { estimatedHours: Number(estimate) }),
    ...(isBlocked ? {} : { blockerDescription: undefined }),
  }
}
