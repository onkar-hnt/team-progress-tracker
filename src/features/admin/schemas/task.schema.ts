import { z } from 'zod'

import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import type { AssignedTask } from '@models/index'
import { todayIsoDate } from '@utils/date.utils'
import { richTextSchema } from '@utils/rich-text.schema'
import { normaliseRichText } from '@utils/rich-text.utils'

const DESCRIPTION_MAX = 1000

export const taskFormSchema = z
  .object({
    name: z.string().trim().min(3, { message: 'Describe the task in a few words' }),
    description: richTextSchema({ max: DESCRIPTION_MAX }).optional(),
    projectId: z.string().min(1, { message: 'Choose a project' }),
    developerId: z.string().min(1, { message: 'Choose a developer' }),
    mentorId: z.string(),
    priority: z.enum(TASK_PRIORITIES),
    status: z.enum(TASK_STATUSES),
    createdDate: z.string().min(1, { message: 'Choose a start date' }),
    dueDate: z.string(),
    estimatedHours: z.string(),
  })
  .refine((values) => values.dueDate === '' || values.dueDate >= values.createdDate, {
    message: 'The due date cannot be before the start date',
    path: ['dueDate'],
  })
  .refine(
    (values) =>
      values.estimatedHours === '' ||
      (Number.isFinite(Number(values.estimatedHours)) && Number(values.estimatedHours) > 0),
    { message: 'Enter a number of hours above zero', path: ['estimatedHours'] },
  )

export type TaskFormValues = z.infer<typeof taskFormSchema>

export function toTaskFormValues(task?: AssignedTask): TaskFormValues {
  return {
    name: task?.name ?? '',
    description: task?.description ?? '',
    projectId: task?.projectId ?? '',
    developerId: task?.developerId ?? '',
    mentorId: task?.mentorId ?? '',
    priority: task?.priority ?? 'medium',
    status: task?.status ?? 'not-started',
    createdDate: task?.createdDate ?? todayIsoDate(),
    dueDate: task?.dueDate ?? '',
    estimatedHours: task?.estimatedHours === undefined ? '' : String(task.estimatedHours),
  }
}

export function toTaskRequest(values: TaskFormValues) {
  return {
    name: values.name,
    projectId: values.projectId,
    developerId: values.developerId,
    priority: values.priority,
    status: values.status,
    createdDate: values.createdDate,

    // Sent rather than omitted, so emptying the box clears the stored description.
    description: normaliseRichText(values.description ?? ''),

    ...(values.mentorId === '' ? {} : { mentorId: values.mentorId }),
    ...(values.dueDate === '' ? {} : { dueDate: values.dueDate }),
    ...(values.estimatedHours === '' ? {} : { estimatedHours: Number(values.estimatedHours) }),
  }
}
