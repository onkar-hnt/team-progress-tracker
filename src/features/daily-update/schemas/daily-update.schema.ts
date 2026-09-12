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

const baseSchema = z
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

    /**
     * The assigned task the day's work belongs to, when it belongs to one.
     *
     * Optional, and deliberately so: plenty of a day goes on work nobody
     * raised a task for, and requiring one made that day impossible to log at
     * all. Where it is set, the database keeps the task and this entry at the
     * same status, which is what stops My Tasks and the dashboard disagreeing
     * about the same work.
     */
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

    /**
     * Carried, not asked.
     *
     * The form no longer offers a priority, but an entry still has one and
     * this form is also how an existing entry is edited — so dropping it
     * outright would quietly reset whatever was set before. New entries get
     * the default and editing round-trips what is already there.
     */
    priority: z.enum(TASK_PRIORITIES),
  })

export const dailyUpdateFormSchema = baseSchema.superRefine((values, ctx) => {
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

export type DailyUpdateFormValues = z.infer<typeof baseSchema>

/** Fills the form from an existing entry, for editing. */
export function toFormValues(entry: DailyWorkEntry): DailyUpdateFormValues {
  return {
    date: entry.date,
    developerId: entry.developerId,
    projectId: entry.projectId,
    taskId: entry.taskId ?? '',
    taskTitle: entry.taskTitle,
    status: entry.status,
    progress: String(entry.progress),
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
    priority: 'medium',
  }
}

/**
 * Converts validated form values into a provider request.
 *
 * The fields the form no longer asks about are simply absent, which the
 * update mapper reads as "leave it alone" — so editing an entry through this
 * form keeps whatever notes or hours it already had rather than erasing what
 * there is no longer an input to retype.
 *
 * `blockerDescription` is the exception, and is cleared rather than left,
 * because an explanation of a blocker that has been lifted is worse than no
 * explanation: the entry lists print it and it would read as current.
 */
export function toCreateDailyWorkEntryRequest(
  values: DailyUpdateFormValues,
): CreateDailyWorkEntryRequest {
  // Derived from the status rather than asked separately. The two always said
  // the same thing, and one of them being a second question people could
  // answer inconsistently only made the reports harder to trust.
  const isBlocked = values.status === 'blocked'

  return {
    date: values.date,
    developerId: values.developerId,
    projectId: values.projectId,
    // Always present, so editing an entry that had a task and now has none
    // clears the column rather than silently keeping the old link.
    taskId: values.taskId === '' ? undefined : values.taskId,
    taskTitle: values.taskTitle.trim(),
    status: values.status,
    priority: values.priority,
    progress: Number(values.progress),
    isBlocked,
    ...(isBlocked ? {} : { blockerDescription: undefined }),
  }
}
